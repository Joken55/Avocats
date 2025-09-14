const { Client } = require('pg');
require('dotenv').config();

// Configuration de la base de données avec les variables Railway
const getDbConfig = () => {
  // Railway fournit ces variables automatiquement
  const config = {
    host: process.env.PGHOST || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.PGPORT || process.env.DATABASE_PORT || '5432'),
    database: process.env.PGDATABASE || process.env.DATABASE_NAME,
    user: process.env.PGUSER || process.env.DATABASE_USER,
    password: process.env.PGPASSWORD || process.env.DATABASE_PASSWORD,
  };

  // SSL pour la production (Railway)
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    config.ssl = {
      rejectUnauthorized: false
    };
  }

  // Si DATABASE_URL est fournie (format Railway/Heroku)
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? {
        rejectUnauthorized: false
      } : false
    };
  }

  return config;
};

// Fonction pour tester la connexion avec retry
async function testConnection(retries = 5, delay = 5000) {
  const config = getDbConfig();
  
  console.log('🔌 Test de connexion à PostgreSQL...');
  console.log(`📍 Host: ${config.host || 'via DATABASE_URL'}`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = new Client(config);
    
    try {
      await client.connect();
      console.log(`✅ Connexion réussie (tentative ${attempt})`);
      await client.end();
      return true;
    } catch (error) {
      console.log(`❌ Tentative ${attempt}/${retries} échouée:`, error.code || error.message);
      
      if (attempt < retries) {
        console.log(`⏳ Nouvelle tentative dans ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      await client.end().catch(() => {}); // Ignore les erreurs de fermeture
    }
  }
  
  throw new Error(`Impossible de se connecter après ${retries} tentatives`);
}

// Fonction pour créer les tables
async function createTables() {
  const config = getDbConfig();
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('📋 Création des tables...');

    // Table des utilisateurs
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des clients
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        telephone VARCHAR(20),
        adresse TEXT,
        date_naissance DATE,
        profession VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des dossiers
    await client.query(`
      CREATE TABLE IF NOT EXISTS dossiers (
        id SERIAL PRIMARY KEY,
        numero_dossier VARCHAR(50) UNIQUE NOT NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        titre VARCHAR(200) NOT NULL,
        description TEXT,
        type_affaire VARCHAR(100),
        statut VARCHAR(50) DEFAULT 'ouvert',
        date_ouverture DATE DEFAULT CURRENT_DATE,
        date_fermeture DATE,
        avocat_responsable VARCHAR(100),
        priorite VARCHAR(20) DEFAULT 'normale',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des rendez-vous
    await client.query(`
      CREATE TABLE IF NOT EXISTS rendez_vous (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        dossier_id INTEGER REFERENCES dossiers(id) ON DELETE SET NULL,
        titre VARCHAR(200) NOT NULL,
        description TEXT,
        date_rdv TIMESTAMP NOT NULL,
        duree INTEGER DEFAULT 60,
        lieu VARCHAR(200),
        statut VARCHAR(50) DEFAULT 'prevu',
        rappel_envoye BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        dossier_id INTEGER REFERENCES dossiers(id) ON DELETE CASCADE,
        nom_fichier VARCHAR(255) NOT NULL,
        nom_original VARCHAR(255) NOT NULL,
        type_fichier VARCHAR(100),
        taille_fichier INTEGER,
        chemin_fichier VARCHAR(500) NOT NULL,
        description TEXT,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des notes
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        dossier_id INTEGER REFERENCES dossiers(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        contenu TEXT NOT NULL,
        type_note VARCHAR(50) DEFAULT 'generale',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index pour améliorer les performances
    await client.query('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_dossiers_numero ON dossiers(numero_dossier)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_dossiers_client ON dossiers(client_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_rdv_date ON rendez_vous(date_rdv)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_rdv_client ON rendez_vous(client_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notes_dossier ON notes(dossier_id)');

    console.log('✅ Tables créées avec succès');

  } catch (error) {
    console.error('❌ Erreur lors de la création des tables:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Fonction pour créer un utilisateur admin par défaut
async function createDefaultAdmin() {
  const config = getDbConfig();
  const client = new Client(config);
  
  try {
    await client.connect();
    
    // Vérifier si un admin existe déjà
    const result = await client.query("SELECT * FROM users WHERE role = 'admin'");
    
    if (result.rows.length === 0) {
      console.log('👤 Création de l\'utilisateur admin par défaut...');
      
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await client.query(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@cabinet.com', passwordHash, 'admin']);
      
      console.log('✅ Utilisateur admin créé');
      console.log('📧 Email: admin@cabinet.com');
      console.log('🔑 Mot de passe: admin123');
      console.log('⚠️  Pensez à changer ce mot de passe !');
    } else {
      console.log('👤 Utilisateur admin existant trouvé');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Fonction principale
async function main() {
  try {
    console.log('🚀 Démarrage de la configuration...');
    console.log('🌍 Environnement:', process.env.NODE_ENV || 'development');
    
    // Test de connexion avec retry
    await testConnection();
    
    // Création des tables
    await createTables();
    
    // Création de l'admin par défaut
    await createDefaultAdmin();
    
    console.log('🎉 Configuration terminée avec succès !');
    
  } catch (error) {
    console.error('💥 Échec de la configuration:', error.message);
    console.error('🔍 Vérifiez vos variables d\'environnement:');
    console.error('   - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD');
    console.error('   - ou DATABASE_URL');
    process.exit(1);
  }
}

// Exécuter si le script est lancé directement
if (require.main === module) {
  main();
}

module.exports = { testConnection, createTables, createDefaultAdmin };