const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Configuration proxy pour Railway
app.set('trust proxy', 1);

// Configuration de la base de données
const getDbConfig = () => {
  const config = {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10
  };
  
  console.log('Configuration DB créée:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: !!config.ssl
  });
  
  return config;
};

const pool = new Pool(getDbConfig());

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware pour parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques (index.html, script.js, etc.)
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Simple rate limiting middleware
const simpleRateLimit = new Map();
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 100;
  
  if (!simpleRateLimit.has(ip)) {
    simpleRateLimit.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  const record = simpleRateLimit.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return next();
  }
  
  if (record.count >= maxRequests) {
    return res.status(429).json({ error: 'Trop de requetes' });
  }
  
  record.count++;
  next();
};

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'acces requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Routes de debug
app.get('/debug-env', (req, res) => {
  const config = getDbConfig();
  res.json({
    'Variables ENV detectees': {
      PGHOST: process.env.PGHOST || 'Non defini',
      PGPORT: process.env.PGPORT || 'Non defini',
      PGDATABASE: process.env.PGDATABASE || 'Non defini',
      PGUSER: process.env.PGUSER || 'Non defini',
      PGPASSWORD: process.env.PGPASSWORD ? 'Defini (masque)' : 'Non defini',
      DATABASE_URL: process.env.DATABASE_URL ? 'Defini (masque)' : 'Non defini'
    },
    'Configuration utilisee par le code': {
      host: config.host || config.connectionString,
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: config.ssl ? 'Active' : 'Desactive'
    },
    'NODE_ENV': process.env.NODE_ENV || 'non defini',
    'RAILWAY_ENVIRONMENT': process.env.RAILWAY_ENVIRONMENT || 'non defini'
  });
});

app.get('/debug-db', async (req, res) => {
  try {
    console.log('Test de connexion DB...');
    const config = getDbConfig();
    console.log('Configuration DB utilisee:', {
      host: config.host || 'via connectionString',
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: !!config.ssl
    });
    
    const client = await pool.connect();
    console.log('Connexion au pool reussie');
    
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log('Requete test reussie:', testResult.rows[0]);
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables trouvees:', tables.rows.length);
    
    client.release();
    
    res.json({ 
      status: 'DB connectee',
      config: {
        host: config.host || 'connectionString utilise',
        port: config.port,
        database: config.database,
        ssl: !!config.ssl
      },
      current_time: testResult.rows[0],
      tables: tables.rows.map(t => t.table_name) 
    });
  } catch (error) {
    console.error('Erreur debug-db:', error);
    res.status(500).json({ 
      status: 'Erreur DB', 
      error: error.message,
      code: error.code,
      config_used: getDbConfig()
    });
  }
});

app.get('/debug-users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role, created_at FROM users');
    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route pour créer toutes les tables
app.post('/setup-tables', async (req, res) => {
  try {
    console.log('Creation des tables...');

    // Table des utilisateurs
    await pool.query(`
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

    // Table des employes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employes (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        poste VARCHAR(100) NOT NULL,
        salaire_base DECIMAL(10,2) NOT NULL,
        salaire_maximum DECIMAL(10,2),
        commissions DECIMAL(10,2) DEFAULT 0,
        anciennete_annees INTEGER DEFAULT 0,
        anciennete_mois INTEGER DEFAULT 0,
        date_embauche DATE NOT NULL,
        numero_employe VARCHAR(20) UNIQUE,
        telephone VARCHAR(20),
        email VARCHAR(100),
        adresse TEXT,
        statut VARCHAR(20) DEFAULT 'actif',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des clients
    await pool.query(`
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
    await pool.query(`
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
    await pool.query(`
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
    await pool.query(`
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
    await pool.query(`
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

    // Index pour ameliorer les performances
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_numero ON employes(numero_employe)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_poste ON employes(poste)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_numero ON dossiers(numero_dossier)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_client ON dossiers(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_date ON rendez_vous(date_rdv)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_client ON rendez_vous(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_dossier ON notes(dossier_id)');

    console.log('Tables creees avec succes');

    // Creer l'admin par defaut
    const existingAdmin = await pool.query("SELECT * FROM users WHERE email = 'admin@cabinet.com'");
    
    if (existingAdmin.rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@cabinet.com', passwordHash, 'admin']);
      
      console.log('Utilisateur admin cree');
    }

    res.json({ 
      message: 'Setup termine avec succes!',
      tables_created: ['users', 'employes', 'clients', 'dossiers', 'rendez_vous', 'documents', 'notes'],
      admin_created: existingAdmin.rows.length === 0
    });

  } catch (error) {
    console.error('Erreur setup tables:', error);
    res.status(500).json({ 
      error: 'Erreur lors du setup', 
      details: error.message 
    });
  }
});

// Routes API - Authentification
app.post('/api/login', rateLimitMiddleware, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Tentative de connexion pour:', email);
    
    if (!email || !password) {
      console.log('Email ou mot de passe manquant');
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    console.log('Recherche utilisateur dans la DB...');
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout requete DB')), 15000);
    });
    
    const queryPromise = pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    const result = await Promise.race([queryPromise, timeoutPromise]);
    console.log('Resultat requete:', result.rows.length, 'utilisateur(s) trouve(s)');
    
    const user = result.rows[0];
    
    if (!user) {
      console.log('Utilisateur non trouve:', email);
      return res.status(401).json({ error: 'Utilisateur non trouve. Verifiez que l\'admin a ete cree.' });
    }
    
    console.log('Utilisateur trouve:', user.email, 'role:', user.role);
    console.log('Verification du mot de passe...');
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('Mot de passe valide:', passwordMatch);
    
    if (!passwordMatch) {
      console.log('Mot de passe incorrect pour:', email);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    
    console.log('Generation du token...');
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );
    
    console.log('Connexion reussie pour:', email);
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Routes API - Employes
app.get('/api/employes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employes ORDER BY nom, prenom');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur recuperation employes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/employes', authenticateToken, async (req, res) => {
  try {
    const { 
      nom, prenom, poste, salaire_base, salaire_maximum, commissions, 
      anciennete_annees, anciennete_mois, date_embauche, numero_employe,
      telephone, email, adresse, statut, notes 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO employes (
        nom, prenom, poste, salaire_base, salaire_maximum, commissions, 
        anciennete_annees, anciennete_mois, date_embauche, numero_employe,
        telephone, email, adresse, statut, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [nom, prenom, poste, salaire_base, salaire_maximum, commissions, 
       anciennete_annees, anciennete_mois, date_embauche, numero_employe,
       telephone, email, adresse, statut, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur creation employe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API - Clients
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur recuperation clients:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, adresse, date_naissance, profession, notes } = req.body;
    
    const result = await pool.query(
      'INSERT INTO clients (nom, prenom, email, telephone, adresse, date_naissance, profession, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [nom, prenom, email, telephone, adresse, date_naissance, profession, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur creation client:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API - Dossiers
app.get('/api/dossiers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, c.nom, c.prenom 
      FROM dossiers d 
      LEFT JOIN clients c ON d.client_id = c.id 
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur recuperation dossiers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API - Rendez-vous
app.get('/api/rendez-vous', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, c.nom, c.prenom, d.titre as dossier_titre 
      FROM rendez_vous r 
      LEFT JOIN clients c ON r.client_id = c.id 
      LEFT JOIN dossiers d ON r.dossier_id = d.id 
      ORDER BY r.date_rdv ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur recuperation rendez-vous:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de verification de sante
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvee' });
});

// Demarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cabinet d'Avocats demarre sur le port ${PORT}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Interface: http://localhost:${PORT}`);
});

// Gestion des erreurs non capturees
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
