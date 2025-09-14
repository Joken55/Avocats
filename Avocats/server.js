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
  // Forcer l'utilisation des variables individuelles pour Railway
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
  
  console.log('🔧 Configuration DB créée:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: !!config.ssl
  });
  
  return config;
};

const pool = new Pool(getDbConfig());

// Middlewares de sécurité (CSP permissif pour debug)
app.use(helmet({
  contentSecurityPolicy: false, // Désactiver temporairement pour debug
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware pour parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Simple rate limiting middleware (custom)
const simpleRateLimit = new Map();
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
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
    return res.status(429).json({ error: 'Trop de requêtes' });
  }
  
  record.count++;
  next();
};

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Routes de debug (temporaires)
app.get('/debug-env', (req, res) => {
  const config = getDbConfig();
  res.json({
    'Variables ENV détectées': {
      PGHOST: process.env.PGHOST || '❌ Non défini',
      PGPORT: process.env.PGPORT || '❌ Non défini',
      PGDATABASE: process.env.PGDATABASE || '❌ Non défini',
      PGUSER: process.env.PGUSER || '❌ Non défini',
      PGPASSWORD: process.env.PGPASSWORD ? '✅ Défini (masqué)' : '❌ Non défini',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ Défini (masqué)' : '❌ Non défini'
    },
    'Configuration utilisée par le code': {
      host: config.host || config.connectionString,
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: config.ssl ? '✅ Activé' : '❌ Désactivé'
    },
    'NODE_ENV': process.env.NODE_ENV || 'non défini',
    'RAILWAY_ENVIRONMENT': process.env.RAILWAY_ENVIRONMENT || 'non défini'
  });
});

app.get('/debug-db', async (req, res) => {
  try {
    console.log('🔍 Test de connexion DB...');
    const config = getDbConfig();
    console.log('📊 Configuration DB utilisée:', {
      host: config.host || 'via connectionString',
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: !!config.ssl
    });
    
    const client = await pool.connect();
    console.log('✅ Connexion au pool réussie');
    
    // Test simple
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log('✅ Requête test réussie:', testResult.rows[0]);
    
    // Vérifier les tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('📋 Tables trouvées:', tables.rows.length);
    
    client.release();
    
    res.json({ 
      status: '✅ DB connectée',
      config: {
        host: config.host || 'connectionString utilisé',
        port: config.port,
        database: config.database,
        ssl: !!config.ssl
      },
      current_time: testResult.rows[0],
      tables: tables.rows.map(t => t.table_name) 
    });
  } catch (error) {
    console.error('💥 Erreur debug-db:', error);
    res.status(500).json({ 
      status: '❌ Erreur DB', 
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
    console.log('📋 Création des tables...');

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

    // Table des employés
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

    // Index pour améliorer les performances
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_numero ON employes(numero_employe)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_poste ON employes(poste)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_numero ON dossiers(numero_dossier)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_client ON dossiers(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_date ON rendez_vous(date_rdv)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_client ON rendez_vous(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_dossier ON notes(dossier_id)');

    console.log('✅ Tables créées avec succès');

    // Créer l'admin par défaut
    const existingAdmin = await pool.query("SELECT * FROM users WHERE email = 'admin@cabinet.com'");
    
    if (existingAdmin.rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@cabinet.com', passwordHash, 'admin']);
      
      console.log('✅ Utilisateur admin créé');
    }

    res.json({ 
      message: '✅ Setup terminé avec succès!',
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
    
    console.log('🔐 Tentative de connexion pour:', email);
    console.log('📝 Corps de la requête:', req.body);
    
    // Vérifier que les paramètres sont présents
    if (!email || !password) {
      console.log('❌ Email ou mot de passe manquant');
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    console.log('📊 Recherche utilisateur dans la DB...');
    
    // Ajouter un timeout à la requête
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout requête DB')), 15000); // 15 secondes
    });
    
    const queryPromise = pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    const result = await Promise.race([queryPromise, timeoutPromise]);
    console.log('📊 Résultat requête:', result.rows.length, 'utilisateur(s) trouvé(s)');
    
    const user = result.rows[0];
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé:', email);
      return res.status(401).json({ error: 'Utilisateur non trouvé. Vérifiez que l\'admin a été créé.' });
    }
    
    console.log('👤 Utilisateur trouvé:', user.email, 'role:', user.role);
    console.log('🔑 Vérification du mot de passe...');
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Mot de passe valide:', passwordMatch);
    
    if (!passwordMatch) {
      console.log('❌ Mot de passe incorrect pour:', email);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    
    console.log('🎟️ Génération du token...');
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Connexion réussie pour:', email);
    
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
    console.error('💥 Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Routes API - Employés
app.get('/api/employes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employes ORDER BY nom, prenom');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération employés:', error);
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
    console.error('Erreur création employé:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API - Clients
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération clients:', error);
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
    console.error('Erreur création client:', error);
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
    console.error('Erreur récupération dossiers:', error);
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
    console.error('Erreur récupération rendez-vous:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route principale - Servir les fichiers séparés
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cabinet d'Avocats - GTA5 RP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { background: white; padding: 2rem; border-radius: 15px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); width: 100%; max-width: 1200px; margin: 0 auto; }
        .logo { text-align: center; margin-bottom: 2rem; }
        .logo h1 { color: #2d3748; font-size: 1.8rem; margin-bottom: 0.5rem; }
        .logo p { color: #718096; font-size: 0.9rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        label { display: block; margin-bottom: 0.5rem; color: #2d3748; font-weight: 500; }
        input, select, textarea { width: 100%; padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; transition: border-color 0.3s; box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #667eea; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; gap: 0.5rem; }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 15px rgba(102, 126, 234, 0.4); }
        .btn-secondary { background: #f7fafc; color: #4a5568; border: 2px solid #e2e8f0; }
        .btn-secondary:hover { background: #edf2f7; }
        .btn-full { width: 100%; }
        .test-accounts { margin-top: 2rem; padding: 1rem; background: #f7fafc; border-radius: 8px; font-size: 0.8rem; color: #4a5568; }
        .test-accounts h3 { margin-bottom: 0.5rem; color: #2d3748; }
        .dashboard { display: none; }
        .dashboard.active { display: block; }
        .navbar { background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%); color: white; padding: 1.5rem; margin: -2rem -2rem 2rem -2rem; border-radius: 15px 15px 0 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .navbar h2 { margin: 0; font-size: 1.5rem; }
        .nav-links { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .nav-link { padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 8px; cursor: pointer; font-size: 0.9rem; transition: all 0.3s; }
        .nav-link:hover, .nav-link.active { background: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .content { min-height: 600px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .section-header h2 { color: #2d3748; margin: 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; transition: all 0.3s; }
        .stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.15); }
        .stat-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .stat-number { font-size: 2.5rem; font-weight: bold; color: #667eea; margin-bottom: 0.5rem; }
        .stat-label { color: #718096; font-size: 0.9rem; font-weight: 500; }
        .welcome-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; text-align: center; }
        .welcome-icon { font-size: 3rem; margin-bottom: 1rem; }
        .welcome-card h3 { margin-bottom: 1rem; font-size: 1.5rem; }
        .welcome-card p { margin-bottom: 1.5rem; opacity: 0.9; }
        .form-card, .data-card { background: #f8f9fa; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; border: 1px solid #e2e8f0; }
        .form-card h3, .data-card h3 { color: #2d3748; margin-bottom: 1.5rem; }
        .data-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .data-header h3 { margin: 0; }
        .form-actions { display: flex; gap: 1rem; margin-top: 2rem; flex-wrap: wrap; }
        .data-list { max-height: 500px; overflow-y: auto; }
        .data-item { background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e2e8f0; transition: all 0.3s; }
        .data-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .data-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .data-item-title { font-weight: bold; color: #2d3748; font-size: 1.1rem; }
        .data-item-info { color: #718096; font-size: 0.9rem; line-height: 1.4; }
        .error { background: #fed7d7; color: #c53030; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .success { background: #c6f6d5; color: #2f855a; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .loading { background: #bee3f8; color: #2b6cb0; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        @media (max-width: 768px) {
            .container { padding: 1rem; margin: 10px; }
            .navbar { margin: -1rem -1rem 2rem -1rem; padding: 1rem; }
            .nav-links { width: 100%; justify-content: center; }
            .form-row { grid-template-columns: 1fr; }
            .stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            <div id="loginMessage"></div>
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleClientForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Clients</h3>
                            <button class="btn btn-secondary" onclick="loadClients()">🔄 Actualiser</button>
                        </div>
                        <div id="clientList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les clients</p>
                        </div>
                    </div>
                </div>
                
                <div id="dossiers" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>📁 Gestion des Dossiers</h2>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Dossiers</h3>
                            <button class="btn btn-secondary" onclick="loadDossiers()">🔄 Actualiser</button>
                        </div>
                        <div id="dossierList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les dossiers</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        
        function showMessage(message, type) {
            const messageDiv = document.getElementById('loginMessage');
            if (messageDiv) {
                messageDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
                if (type === 'success' || type === 'loading') {
                    setTimeout(function() { messageDiv.innerHTML = ''; }, 3000);
                }
            }
        }
        
        if (authToken) {
            showDashboard();
            loadStats();
        }
        
        document.getElementById('login').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                showMessage('Connexion en cours...', 'loading');
                
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    authToken = data.token;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showMessage('Connexion réussie !', 'success');
                    setTimeout(function() {
                        showDashboard();
                        loadStats();
                    }, 1000);
                } else {
                    showMessage('Erreur: ' + data.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur de connexion: ' + error.message, 'error');
            }
        });
        
        function showDashboard() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }
        
        function showSection(sectionName) {
            const sections = document.querySelectorAll('.section');
            sections.forEach(function(section) {
                section.style.display = 'none';
            });
            
            const links = document.querySelectorAll('.nav-link');
            links.forEach(function(link) {
                link.classList.remove('active');
            });
            
            document.getElementById(sectionName).style.display = 'block';
            event.target.classList.add('active');
        }
        
        async function loadStats() {
            try {
                const responses = await Promise.all([
                    fetch('/api/employes', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/clients', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/dossiers', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/rendez-vous', { headers: { 'Authorization': 'Bearer ' + authToken } })
                ]);
                
                if (responses[0].ok) {
                    const employes = await responses[0].json();
                    document.getElementById('employeCount').textContent = employes.length;
                }
                
                if (responses[1].ok) {
                    const clients = await responses[1].json();
                    document.getElementById('clientCount').textContent = clients.length;
                }
                
                if (responses[2].ok) {
                    const dossiers = await responses[2].json();
                    document.getElementById('dossierCount').textContent = dossiers.length;
                }
                
                if (responses[3].ok) {
                    const rdvs = await responses[3].json();
                    document.getElementById('rdvCount').textContent = rdvs.length;
                }
            } catch (error) {
                console.error('Erreur chargement stats:', error);
            }
        }
        
        function toggleEmployeForm() {
            const form = document.getElementById('employeForm');
            const isVisible = form.style.display !== 'none';
            form.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                document.getElementById('newEmployeForm').reset();
            }
        }
        
        function toggleClientForm() {
            const form = document.getElementById('clientForm');
            const isVisible = form.style.display !== 'none';
            form.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                document.getElementById('newClientForm').reset();
            }
        }
        
        document.getElementById('newEmployeForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const employeData = {};
            formData.forEach(function(value, key) {
                employeData[key] = value;
            });
            
            try {
                showMessage('Création de l\\'employé...', 'loading');
                const response = await fetch('/api/employes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(employeData)
                });
                
                if (response.ok) {
                    showMessage('Employé créé avec succès !', 'success');
                    toggleEmployeForm();
                    loadEmployes();
                    loadStats();
                } else {
                    const error = await response.json();
                    showMessage('Erreur : ' + error.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur : ' + error.message, 'error');
            }
        });
        
        document.getElementById('newClientForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const clientData = {};
            formData.forEach(function(value, key) {
                clientData[key] = value;
            });
            
            try {
                showMessage('Création du client...', 'loading');
                const response = await fetch('/api/clients', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(clientData)
                });
                
                if (response.ok) {
                    showMessage('Client créé avec succès !', 'success');
                    toggleClientForm();
                    loadClients();
                    loadStats();
                } else {
                    const error = await response.json();
                    showMessage('Erreur : ' + error.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur : ' + error.message, 'error');
            }
        });
        
        async function loadEmployes() {
            try {
                const response = await fetch('/api/employes', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const employes = await response.json();
                    const employeList = document.getElementById('employeList');
                    
                    if (employes.length === 0) {
                        employeList.innerHTML = '<p>Aucun employé trouvé.</p>';
                    } else {
                        let html = '';
                        employes.forEach(function(employe) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + employe.prenom + ' ' + employe.nom + '</div>';
                            html += '<div style="color: #667eea; font-weight: bold;">' + employe.poste + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            html += '<strong>Salaire :</strong> ">
        <!-- Formulaire de connexion -->
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            
            <div id="loginMessage"></div>
            
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Numéro Employé</label>
                                    <input type="text" name="numero_employe" placeholder="EMP001">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                                <div class="form-group">
                                    <label>Salaire Maximum ($)</label>
                                    <input type="number" name="salaire_maximum" step="0.01">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email">
                                </div>
                                <div class="form-group">
                                    <label>Téléphone</label>
                 + parseFloat(employe.salaire_base).toLocaleString() + '<br>';
                            html += '<strong>Date embauche :</strong> ' + employe.date_embauche + '<br>';
                            if (employe.telephone) html += '<strong>Téléphone :</strong> ' + employe.telephone + '<br>';
                            if (employe.email) html += '<strong>Email :</strong> ' + employe.email;
                            html += '</div>';
                            html += '</div>';
                        });
                        employeList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        async function loadClients() {
            try {
                const response = await fetch('/api/clients', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const clients = await response.json();
                    const clientList = document.getElementById('clientList');
                    
                    if (clients.length === 0) {
                        clientList.innerHTML = '<p>Aucun client trouvé.</p>';
                    } else {
                        let html = '';
                        clients.forEach(function(client) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + client.prenom + ' ' + client.nom + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            if (client.email) html += '<strong>Email :</strong> ' + client.email + '<br>';
                            if (client.telephone) html += '<strong>Téléphone :</strong> ' + client.telephone + '<br>';
                            if (client.profession) html += '<strong>Profession :</strong> ' + client.profession;
                            html += '</div>';
                            html += '</div>';
                        });
                        clientList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        async function loadDossiers() {
            try {
                const response = await fetch('/api/dossiers', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const dossiers = await response.json();
                    const dossierList = document.getElementById('dossierList');
                    
                    if (dossiers.length === 0) {
                        dossierList.innerHTML = '<p>Aucun dossier trouvé.</p>';
                    } else {
                        let html = '';
                        dossiers.forEach(function(dossier) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + dossier.titre + '</div>';
                            html += '<div style="color: #667eea; font-weight: bold;">' + dossier.statut + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            html += '<strong>Numéro :</strong> ' + dossier.numero_dossier + '<br>';
                            if (dossier.nom) html += '<strong>Client :</strong> ' + dossier.prenom + ' ' + dossier.nom + '<br>';
                            if (dossier.type_affaire) html += '<strong>Type :</strong> ' + dossier.type_affaire;
                            html += '</div>';
                            html += '</div>';
                        });
                        dossierList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        function logout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            location.reload();
        }
    </script>
</body>
</html>`);
});
        <!-- Formulaire de connexion -->
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            
            <div id="loginMessage"></div>
            
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Numéro Employé</label>
                                    <input type="text" name="numero_employe" placeholder="EMP001">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                                <div class="form-group">
                                    <label>Salaire Maximum ($)</label>
                                    <input type="number" name="salaire_maximum" step="0.01">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email">
                                </div>
                                <div class="form-group">
                                    <label>Téléphone</label>
                                    // Route de vérification de santé
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Cabinet d'Avocats démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Interface: http://localhost:${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});const express = require('express');
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
  // Forcer l'utilisation des variables individuelles pour Railway
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
  
  console.log('🔧 Configuration DB créée:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: !!config.ssl
  });
  
  return config;
};

const pool = new Pool(getDbConfig());

// Middlewares de sécurité (CSP permissif pour debug)
app.use(helmet({
  contentSecurityPolicy: false, // Désactiver temporairement pour debug
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware pour parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Simple rate limiting middleware (custom)
const simpleRateLimit = new Map();
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
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
    return res.status(429).json({ error: 'Trop de requêtes' });
  }
  
  record.count++;
  next();
};

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Routes de debug (temporaires)
app.get('/debug-env', (req, res) => {
  const config = getDbConfig();
  res.json({
    'Variables ENV détectées': {
      PGHOST: process.env.PGHOST || '❌ Non défini',
      PGPORT: process.env.PGPORT || '❌ Non défini',
      PGDATABASE: process.env.PGDATABASE || '❌ Non défini',
      PGUSER: process.env.PGUSER || '❌ Non défini',
      PGPASSWORD: process.env.PGPASSWORD ? '✅ Défini (masqué)' : '❌ Non défini',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ Défini (masqué)' : '❌ Non défini'
    },
    'Configuration utilisée par le code': {
      host: config.host || config.connectionString,
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: config.ssl ? '✅ Activé' : '❌ Désactivé'
    },
    'NODE_ENV': process.env.NODE_ENV || 'non défini',
    'RAILWAY_ENVIRONMENT': process.env.RAILWAY_ENVIRONMENT || 'non défini'
  });
});

app.get('/debug-db', async (req, res) => {
  try {
    console.log('🔍 Test de connexion DB...');
    const config = getDbConfig();
    console.log('📊 Configuration DB utilisée:', {
      host: config.host || 'via connectionString',
      port: config.port,
      database: config.database,
      user: config.user,
      ssl: !!config.ssl
    });
    
    const client = await pool.connect();
    console.log('✅ Connexion au pool réussie');
    
    // Test simple
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log('✅ Requête test réussie:', testResult.rows[0]);
    
    // Vérifier les tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('📋 Tables trouvées:', tables.rows.length);
    
    client.release();
    
    res.json({ 
      status: '✅ DB connectée',
      config: {
        host: config.host || 'connectionString utilisé',
        port: config.port,
        database: config.database,
        ssl: !!config.ssl
      },
      current_time: testResult.rows[0],
      tables: tables.rows.map(t => t.table_name) 
    });
  } catch (error) {
    console.error('💥 Erreur debug-db:', error);
    res.status(500).json({ 
      status: '❌ Erreur DB', 
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
    console.log('📋 Création des tables...');

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

    // Table des employés
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

    // Index pour améliorer les performances
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_numero ON employes(numero_employe)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_employes_poste ON employes(poste)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_numero ON dossiers(numero_dossier)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_client ON dossiers(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_date ON rendez_vous(date_rdv)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_client ON rendez_vous(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_dossier ON notes(dossier_id)');

    console.log('✅ Tables créées avec succès');

    // Créer l'admin par défaut
    const existingAdmin = await pool.query("SELECT * FROM users WHERE email = 'admin@cabinet.com'");
    
    if (existingAdmin.rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@cabinet.com', passwordHash, 'admin']);
      
      console.log('✅ Utilisateur admin créé');
    }

    res.json({ 
      message: '✅ Setup terminé avec succès!',
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
    
    console.log('🔐 Tentative de connexion pour:', email);
    console.log('📝 Corps de la requête:', req.body);
    
    // Vérifier que les paramètres sont présents
    if (!email || !password) {
      console.log('❌ Email ou mot de passe manquant');
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    console.log('📊 Recherche utilisateur dans la DB...');
    
    // Ajouter un timeout à la requête
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout requête DB')), 15000); // 15 secondes
    });
    
    const queryPromise = pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    const result = await Promise.race([queryPromise, timeoutPromise]);
    console.log('📊 Résultat requête:', result.rows.length, 'utilisateur(s) trouvé(s)');
    
    const user = result.rows[0];
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé:', email);
      return res.status(401).json({ error: 'Utilisateur non trouvé. Vérifiez que l\'admin a été créé.' });
    }
    
    console.log('👤 Utilisateur trouvé:', user.email, 'role:', user.role);
    console.log('🔑 Vérification du mot de passe...');
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Mot de passe valide:', passwordMatch);
    
    if (!passwordMatch) {
      console.log('❌ Mot de passe incorrect pour:', email);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    
    console.log('🎟️ Génération du token...');
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Connexion réussie pour:', email);
    
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
    console.error('💥 Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Routes API - Employés
app.get('/api/employes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employes ORDER BY nom, prenom');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération employés:', error);
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
    console.error('Erreur création employé:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API - Clients
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération clients:', error);
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
    console.error('Erreur création client:', error);
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
    console.error('Erreur récupération dossiers:', error);
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
    console.error('Erreur récupération rendez-vous:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route principale - Servir les fichiers séparés
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cabinet d'Avocats - GTA5 RP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { background: white; padding: 2rem; border-radius: 15px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); width: 100%; max-width: 1200px; margin: 0 auto; }
        .logo { text-align: center; margin-bottom: 2rem; }
        .logo h1 { color: #2d3748; font-size: 1.8rem; margin-bottom: 0.5rem; }
        .logo p { color: #718096; font-size: 0.9rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        label { display: block; margin-bottom: 0.5rem; color: #2d3748; font-weight: 500; }
        input, select, textarea { width: 100%; padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; transition: border-color 0.3s; box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #667eea; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; gap: 0.5rem; }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 15px rgba(102, 126, 234, 0.4); }
        .btn-secondary { background: #f7fafc; color: #4a5568; border: 2px solid #e2e8f0; }
        .btn-secondary:hover { background: #edf2f7; }
        .btn-full { width: 100%; }
        .test-accounts { margin-top: 2rem; padding: 1rem; background: #f7fafc; border-radius: 8px; font-size: 0.8rem; color: #4a5568; }
        .test-accounts h3 { margin-bottom: 0.5rem; color: #2d3748; }
        .dashboard { display: none; }
        .dashboard.active { display: block; }
        .navbar { background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%); color: white; padding: 1.5rem; margin: -2rem -2rem 2rem -2rem; border-radius: 15px 15px 0 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .navbar h2 { margin: 0; font-size: 1.5rem; }
        .nav-links { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .nav-link { padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 8px; cursor: pointer; font-size: 0.9rem; transition: all 0.3s; }
        .nav-link:hover, .nav-link.active { background: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .content { min-height: 600px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .section-header h2 { color: #2d3748; margin: 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; transition: all 0.3s; }
        .stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.15); }
        .stat-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .stat-number { font-size: 2.5rem; font-weight: bold; color: #667eea; margin-bottom: 0.5rem; }
        .stat-label { color: #718096; font-size: 0.9rem; font-weight: 500; }
        .welcome-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; text-align: center; }
        .welcome-icon { font-size: 3rem; margin-bottom: 1rem; }
        .welcome-card h3 { margin-bottom: 1rem; font-size: 1.5rem; }
        .welcome-card p { margin-bottom: 1.5rem; opacity: 0.9; }
        .form-card, .data-card { background: #f8f9fa; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; border: 1px solid #e2e8f0; }
        .form-card h3, .data-card h3 { color: #2d3748; margin-bottom: 1.5rem; }
        .data-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .data-header h3 { margin: 0; }
        .form-actions { display: flex; gap: 1rem; margin-top: 2rem; flex-wrap: wrap; }
        .data-list { max-height: 500px; overflow-y: auto; }
        .data-item { background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e2e8f0; transition: all 0.3s; }
        .data-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .data-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .data-item-title { font-weight: bold; color: #2d3748; font-size: 1.1rem; }
        .data-item-info { color: #718096; font-size: 0.9rem; line-height: 1.4; }
        .error { background: #fed7d7; color: #c53030; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .success { background: #c6f6d5; color: #2f855a; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .loading { background: #bee3f8; color: #2b6cb0; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        @media (max-width: 768px) {
            .container { padding: 1rem; margin: 10px; }
            .navbar { margin: -1rem -1rem 2rem -1rem; padding: 1rem; }
            .nav-links { width: 100%; justify-content: center; }
            .form-row { grid-template-columns: 1fr; }
            .stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            <div id="loginMessage"></div>
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleClientForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Clients</h3>
                            <button class="btn btn-secondary" onclick="loadClients()">🔄 Actualiser</button>
                        </div>
                        <div id="clientList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les clients</p>
                        </div>
                    </div>
                </div>
                
                <div id="dossiers" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>📁 Gestion des Dossiers</h2>
                    </div>
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Dossiers</h3>
                            <button class="btn btn-secondary" onclick="loadDossiers()">🔄 Actualiser</button>
                        </div>
                        <div id="dossierList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les dossiers</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        
        function showMessage(message, type) {
            const messageDiv = document.getElementById('loginMessage');
            if (messageDiv) {
                messageDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
                if (type === 'success' || type === 'loading') {
                    setTimeout(function() { messageDiv.innerHTML = ''; }, 3000);
                }
            }
        }
        
        if (authToken) {
            showDashboard();
            loadStats();
        }
        
        document.getElementById('login').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                showMessage('Connexion en cours...', 'loading');
                
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    authToken = data.token;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showMessage('Connexion réussie !', 'success');
                    setTimeout(function() {
                        showDashboard();
                        loadStats();
                    }, 1000);
                } else {
                    showMessage('Erreur: ' + data.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur de connexion: ' + error.message, 'error');
            }
        });
        
        function showDashboard() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }
        
        function showSection(sectionName) {
            const sections = document.querySelectorAll('.section');
            sections.forEach(function(section) {
                section.style.display = 'none';
            });
            
            const links = document.querySelectorAll('.nav-link');
            links.forEach(function(link) {
                link.classList.remove('active');
            });
            
            document.getElementById(sectionName).style.display = 'block';
            event.target.classList.add('active');
        }
        
        async function loadStats() {
            try {
                const responses = await Promise.all([
                    fetch('/api/employes', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/clients', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/dossiers', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/rendez-vous', { headers: { 'Authorization': 'Bearer ' + authToken } })
                ]);
                
                if (responses[0].ok) {
                    const employes = await responses[0].json();
                    document.getElementById('employeCount').textContent = employes.length;
                }
                
                if (responses[1].ok) {
                    const clients = await responses[1].json();
                    document.getElementById('clientCount').textContent = clients.length;
                }
                
                if (responses[2].ok) {
                    const dossiers = await responses[2].json();
                    document.getElementById('dossierCount').textContent = dossiers.length;
                }
                
                if (responses[3].ok) {
                    const rdvs = await responses[3].json();
                    document.getElementById('rdvCount').textContent = rdvs.length;
                }
            } catch (error) {
                console.error('Erreur chargement stats:', error);
            }
        }
        
        function toggleEmployeForm() {
            const form = document.getElementById('employeForm');
            const isVisible = form.style.display !== 'none';
            form.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                document.getElementById('newEmployeForm').reset();
            }
        }
        
        function toggleClientForm() {
            const form = document.getElementById('clientForm');
            const isVisible = form.style.display !== 'none';
            form.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                document.getElementById('newClientForm').reset();
            }
        }
        
        document.getElementById('newEmployeForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const employeData = {};
            formData.forEach(function(value, key) {
                employeData[key] = value;
            });
            
            try {
                showMessage('Création de l\\'employé...', 'loading');
                const response = await fetch('/api/employes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(employeData)
                });
                
                if (response.ok) {
                    showMessage('Employé créé avec succès !', 'success');
                    toggleEmployeForm();
                    loadEmployes();
                    loadStats();
                } else {
                    const error = await response.json();
                    showMessage('Erreur : ' + error.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur : ' + error.message, 'error');
            }
        });
        
        document.getElementById('newClientForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const clientData = {};
            formData.forEach(function(value, key) {
                clientData[key] = value;
            });
            
            try {
                showMessage('Création du client...', 'loading');
                const response = await fetch('/api/clients', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(clientData)
                });
                
                if (response.ok) {
                    showMessage('Client créé avec succès !', 'success');
                    toggleClientForm();
                    loadClients();
                    loadStats();
                } else {
                    const error = await response.json();
                    showMessage('Erreur : ' + error.error, 'error');
                }
            } catch (error) {
                showMessage('Erreur : ' + error.message, 'error');
            }
        });
        
        async function loadEmployes() {
            try {
                const response = await fetch('/api/employes', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const employes = await response.json();
                    const employeList = document.getElementById('employeList');
                    
                    if (employes.length === 0) {
                        employeList.innerHTML = '<p>Aucun employé trouvé.</p>';
                    } else {
                        let html = '';
                        employes.forEach(function(employe) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + employe.prenom + ' ' + employe.nom + '</div>';
                            html += '<div style="color: #667eea; font-weight: bold;">' + employe.poste + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            html += '<strong>Salaire :</strong> ">
        <!-- Formulaire de connexion -->
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            
            <div id="loginMessage"></div>
            
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Numéro Employé</label>
                                    <input type="text" name="numero_employe" placeholder="EMP001">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                                <div class="form-group">
                                    <label>Salaire Maximum ($)</label>
                                    <input type="number" name="salaire_maximum" step="0.01">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email">
                                </div>
                                <div class="form-group">
                                    <label>Téléphone</label>
                 + parseFloat(employe.salaire_base).toLocaleString() + '<br>';
                            html += '<strong>Date embauche :</strong> ' + employe.date_embauche + '<br>';
                            if (employe.telephone) html += '<strong>Téléphone :</strong> ' + employe.telephone + '<br>';
                            if (employe.email) html += '<strong>Email :</strong> ' + employe.email;
                            html += '</div>';
                            html += '</div>';
                        });
                        employeList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        async function loadClients() {
            try {
                const response = await fetch('/api/clients', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const clients = await response.json();
                    const clientList = document.getElementById('clientList');
                    
                    if (clients.length === 0) {
                        clientList.innerHTML = '<p>Aucun client trouvé.</p>';
                    } else {
                        let html = '';
                        clients.forEach(function(client) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + client.prenom + ' ' + client.nom + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            if (client.email) html += '<strong>Email :</strong> ' + client.email + '<br>';
                            if (client.telephone) html += '<strong>Téléphone :</strong> ' + client.telephone + '<br>';
                            if (client.profession) html += '<strong>Profession :</strong> ' + client.profession;
                            html += '</div>';
                            html += '</div>';
                        });
                        clientList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        async function loadDossiers() {
            try {
                const response = await fetch('/api/dossiers', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    const dossiers = await response.json();
                    const dossierList = document.getElementById('dossierList');
                    
                    if (dossiers.length === 0) {
                        dossierList.innerHTML = '<p>Aucun dossier trouvé.</p>';
                    } else {
                        let html = '';
                        dossiers.forEach(function(dossier) {
                            html += '<div class="data-item">';
                            html += '<div class="data-item-header">';
                            html += '<div class="data-item-title">' + dossier.titre + '</div>';
                            html += '<div style="color: #667eea; font-weight: bold;">' + dossier.statut + '</div>';
                            html += '</div>';
                            html += '<div class="data-item-info">';
                            html += '<strong>Numéro :</strong> ' + dossier.numero_dossier + '<br>';
                            if (dossier.nom) html += '<strong>Client :</strong> ' + dossier.prenom + ' ' + dossier.nom + '<br>';
                            if (dossier.type_affaire) html += '<strong>Type :</strong> ' + dossier.type_affaire;
                            html += '</div>';
                            html += '</div>';
                        });
                        dossierList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        function logout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            location.reload();
        }
    </script>
</body>
</html>`);
});
        <!-- Formulaire de connexion -->
        <div id="loginForm">
            <div class="logo">
                <h1>🏛️ Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
            </div>
            
            <div id="loginMessage"></div>
            
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-full">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>🏛️ Cabinet d'Avocats</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">📊 Aperçu</button>
                    <button class="nav-link" onclick="showSection('employes')">👥 Employés</button>
                    <button class="nav-link" onclick="showSection('clients')">🤝 Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">📁 Dossiers</button>
                    <button class="nav-link" onclick="logout()">🚪 Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-number" id="employeCount">0</div>
                            <div class="stat-label">Employés</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🤝</div>
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📁</div>
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    
                    <div class="welcome-card">
                        <div class="welcome-icon">🎉</div>
                        <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="employes" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>👥 Gestion des Employés</h2>
                        <button class="btn btn-primary" onclick="toggleEmployeForm()">➕ Nouvel Employé</button>
                    </div>
                    
                    <div id="employeForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Employé</h3>
                        <form id="newEmployeForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Poste</label>
                                    <select name="poste" required>
                                        <option value="">Choisir un poste</option>
                                        <option value="Avocat Senior">Avocat Senior</option>
                                        <option value="Avocat Junior">Avocat Junior</option>
                                        <option value="Stagiaire">Stagiaire</option>
                                        <option value="Secrétaire">Secrétaire</option>
                                        <option value="Assistant juridique">Assistant juridique</option>
                                        <option value="Comptable">Comptable</option>
                                        <option value="Directeur">Directeur</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Numéro Employé</label>
                                    <input type="text" name="numero_employe" placeholder="EMP001">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Salaire de Base ($)</label>
                                    <input type="number" name="salaire_base" step="0.01" required>
                                </div>
                                <div class="form-group">
                                    <label>Salaire Maximum ($)</label>
                                    <input type="number" name="salaire_maximum" step="0.01">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Commissions ($)</label>
                                    <input type="number" name="commissions" step="0.01" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Date d'Embauche</label>
                                    <input type="date" name="date_embauche" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Enregistrer</button>
                                <button type="button" class="btn btn-secondary" onclick="toggleEmployeForm()">❌ Annuler</button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="data-card">
                        <div class="data-header">
                            <h3>Liste des Employés</h3>
                            <button class="btn btn-secondary" onclick="loadEmployes()">🔄 Actualiser</button>
                        </div>
                        <div id="employeList" class="data-list">
                            <p>Cliquez sur "Actualiser" pour charger les employés</p>
                        </div>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="section-header">
                        <h2>🤝 Gestion des Clients</h2>
                        <button class="btn btn-primary" onclick="toggleClientForm()">➕ Nouveau Client</button>
                    </div>
                    
                    <div id="clientForm" class="form-card" style="display: none;">
                        <h3>Ajouter un Client</h3>
                        <form id="newClientForm">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="prenom" required>
                                </div>
                                <div class="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="nom" required>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email">
                                </div>
                                <div class="form-group">
                                    <label>Téléphone</label>
