const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Configuration proxy pour Railway
app.set('trust proxy', 1);

// Configuration de la base de données
const getDbConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    };
  }
  
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'cabinet_avocats',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false
  };
};

const pool = new Pool(getDbConfig());

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware pour parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    const client = await pool.connect();
    
    const testResult = await client.query('SELECT NOW() as current_time');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    client.release();
    
    res.json({ 
      status: 'DB connectee',
      current_time: testResult.rows[0],
      tables: tables.rows.map(t => t.table_name) 
    });
  } catch (error) {
    console.error('Erreur debug-db:', error);
    res.status(500).json({ 
      status: 'Erreur DB', 
      error: error.message
    });
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

    console.log('Tables creees avec succes');

    // Créer l'admin par défaut
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
      tables_created: ['users', 'clients', 'dossiers', 'rendez_vous'],
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
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouve' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );
    
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

// Routes API - Clients
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, prenom, email, telephone, adresse, date_naissance, profession, notes } = req.body;
    
    const result = await pool.query(
      `UPDATE clients SET 
        nom = $1, prenom = $2, email = $3, telephone = $4, 
        adresse = $5, date_naissance = $6, profession = $7, notes = $8, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $9 RETURNING *`,
      [nom, prenom, email, telephone, adresse, date_naissance, profession, notes, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouve' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouve' });
    }
    
    res.json({ message: 'Client supprime avec succes' });
  } catch (error) {
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/dossiers', authenticateToken, async (req, res) => {
  try {
    const { numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite } = req.body;
    
    const result = await pool.query(
      'INSERT INTO dossiers (numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/dossiers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_dossier, client_id, titre, description, type_affaire, statut, avocat_responsable, priorite } = req.body;
    
    const result = await pool.query(
      `UPDATE dossiers SET 
        numero_dossier = $1, client_id = $2, titre = $3, description = $4, 
        type_affaire = $5, statut = $6, avocat_responsable = $7, priorite = $8, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $9 RETURNING *`,
      [numero_dossier, client_id, titre, description, type_affaire, statut, avocat_responsable, priorite, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/dossiers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM dossiers WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }
    
    res.json({ message: 'Dossier supprime avec succes' });
  } catch (error) {
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/rendez-vous', authenticateToken, async (req, res) => {
  try {
    const { client_id, dossier_id, titre, description, date_rdv, duree, lieu } = req.body;
    
    const result = await pool.query(
      'INSERT INTO rendez_vous (client_id, dossier_id, titre, description, date_rdv, duree, lieu) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [client_id, dossier_id, titre, description, date_rdv, duree, lieu]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route principale avec HTML integre
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cabinet d'Avocats - GTA5 RP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { background: white; margin: 20px auto; border-radius: 15px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); width: 95%; max-width: 1200px; overflow: hidden; }
        .login-container { padding: 3rem; text-align: center; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-box { background: white; padding: 3rem; border-radius: 15px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); width: 100%; max-width: 400px; }
        .logo { margin-bottom: 2rem; }
        .logo h1 { color: #2d3748; font-size: 2rem; margin-bottom: 0.5rem; }
        .logo p { color: #718096; font-size: 1rem; }
        .form-group { margin-bottom: 1.5rem; text-align: left; }
        label { display: block; margin-bottom: 0.5rem; color: #2d3748; font-weight: 500; }
        input, select, textarea { width: 100%; padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; transition: border-color 0.3s; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #667eea; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; text-decoration: none; display: inline-block; text-align: center; }
        .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; width: 100%; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 15px rgba(102, 126, 234, 0.4); }
        .btn-secondary { background: #f7fafc; color: #4a5568; border: 2px solid #e2e8f0; }
        .btn-secondary:hover { background: #edf2f7; }
        .btn-danger { background: #f56565; color: white; }
        .btn-sm { padding: 0.5rem 1rem; font-size: 0.875rem; }
        .test-accounts { margin-top: 2rem; padding: 1rem; background: #f7fafc; border-radius: 8px; font-size: 0.9rem; color: #4a5568; }
        .test-accounts h3 { margin-bottom: 0.5rem; color: #2d3748; }
        .dashboard { display: none; }
        .dashboard.active { display: block; }
        .navbar { background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%); color: white; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .navbar h2 { margin: 0; font-size: 1.5rem; }
        .nav-links { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .nav-link { padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 8px; cursor: pointer; font-size: 0.9rem; transition: all 0.3s; }
        .nav-link:hover, .nav-link.active { background: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .content { padding: 2rem; min-height: 600px; }
        .section { display: none; }
        .section.active { display: block; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .section-header h2 { color: #2d3748; margin: 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; transition: all 0.3s; }
        .stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.15); }
        .stat-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .stat-number { font-size: 2.5rem; font-weight: bold; color: #667eea; margin-bottom: 0.5rem; }
        .stat-label { color: #718096; font-size: 0.9rem; font-weight: 500; }
        .welcome-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; text-align: center; margin-bottom: 2rem; }
        .welcome-icon { font-size: 3rem; margin-bottom: 1rem; }
        .welcome-card h3 { margin-bottom: 1rem; font-size: 1.5rem; }
        .welcome-card p { margin-bottom: 1.5rem; opacity: 0.9; }
        .card { background: #f8f9fa; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; border: 1px solid #e2e8f0; }
        .card h3 { color: #2d3748; margin-bottom: 1.5rem; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-actions { display: flex; gap: 1rem; margin-top: 2rem; flex-wrap: wrap; }
        .data-list { max-height: 500px; overflow-y: auto; }
        .data-item { background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e2e8f0; transition: all 0.3s; }
        .data-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .data-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .data-item-title { font-weight: bold; color: #2d3748; font-size: 1.1rem; }
        .data-item-info { color: #718096; font-size: 0.9rem; line-height: 1.4; margin-bottom: 1rem; }
        .data-item-actions { display: flex; gap: 0.5rem; }
        .error { background: #fed7d7; color: #c53030; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .success { background: #c6f6d5; color: #2f855a; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .loading { background: #bee3f8; color: #2b6cb0; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; }
        .modal.active { display: flex; align-items: center; justify-content: center; }
        .modal-content { background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .modal-header h3 { margin: 0; color: #2d3748; }
        .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #718096; }
        @media (max-width: 768px) {
            .container { margin: 10px; width: calc(100% - 20px); }
            .navbar { padding: 1rem; flex-direction: column; gap: 1rem; }
            .nav-links { width: 100%; justify-content: center; }
            .form-row { grid-template-columns: 1fr; }
            .stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
            .section-header { flex-direction: column; align-items: stretch; }
            .modal-content { margin: 1rem; width: calc(100% - 2rem); }
        }
    </style>
</head>
<body>
    <div class="login-container" id="loginContainer">
        <div class="login-box">
            <div class="logo">
                <h1>Cabinet d'Avocats</h1>
                <p>Connexion au systeme GTA5 RP</p>
            </div>
            <div id="loginMessage"></div>
            <form id="loginForm">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" value="admin@cabinet.com" required>
                </div>
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" value="admin123" required>
                </div>
                <button type="submit" class="btn btn-primary">Se connecter</button>
            </form>
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
            </div>
        </div>
    </div>
    
    <div class="container dashboard" id="dashboard">
        <div class="navbar">
            <h2>Cabinet d'Avocats</h2>
            <div class="nav-links">
                <button class="nav-link active" onclick="showSection('overview')">Apercu</button>
                <button class="nav-link" onclick="showSection('clients')">Clients</button>
                <button class="nav-link" onclick="showSection('dossiers')">Dossiers</button>
                <button class="nav-link" onclick="showSection('rendez-vous')">Rendez-vous</button>
                <button class="nav-link" onclick="logout()">Deconnexion</button>
            </div>
        </div>
        
        <div class="content">
            <div id="overview" class="section active">
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-icon">👥</div>
                        <div class="stat-number" id="clientCount">
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
                        <div class="stat-label">Rendez-vous</div>
                    </div>
                </div>
                <div class="welcome-card">
                    <div class="welcome-icon">🎉</div>
                    <h3>Bienvenue dans votre Cabinet d'Avocats !</h3>
                    <p>Votre systeme de gestion est operationnel et pret a l'emploi.</p>
                </div>
            </div>
            
            <div id="clients" class="section">
                <div class="section-header">
                    <h2>Gestion des Clients</h2>
                    <button class="btn btn-primary" onclick="openClientModal()">Nouveau Client</button>
                </div>
                <div class="card">
                    <div class="data-list" id="clientsList">
                        <p>Chargement des clients...</p>
                    </div>
                </div>
            </div>
            
            <div id="dossiers" class="section">
                <div class="section-header">
                    <h2>Gestion des Dossiers</h2>
                    <button class="btn btn-primary" onclick="openDossierModal()">Nouveau Dossier</button>
                </div>
                <div class="card">
                    <div class="data-list" id="dossiersList">
                        <p>Chargement des dossiers...</p>
                    </div>
                </div>
            </div>
            
            <div id="rendez-vous" class="section">
                <div class="section-header">
                    <h2>Gestion des Rendez-vous</h2>
                    <button class="btn btn-primary" onclick="openRdvModal()">Nouveau Rendez-vous</button>
                </div>
                <div class="card">
                    <div class="data-list" id="rdvList">
                        <p>Chargement des rendez-vous...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Modal Client -->
    <div id="clientModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="clientModalTitle">Nouveau Client</h3>
                <button class="close-btn" onclick="closeClientModal()">&times;</button>
            </div>
            <form id="clientForm">
                <input type="hidden" id="clientId">
                <div class="form-row">
                    <div class="form-group">
                        <label for="clientPrenom">Prenom :</label>
                        <input type="text" id="clientPrenom" name="prenom" required>
                    </div>
                    <div class="form-group">
                        <label for="clientNom">Nom :</label>
                        <input type="text" id="clientNom" name="nom" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="clientEmail">Email :</label>
                        <input type="email" id="clientEmail" name="email">
                    </div>
                    <div class="form-group">
                        <label for="clientTelephone">Telephone :</label>
                        <input type="tel" id="clientTelephone" name="telephone">
                    </div>
                </div>
                <div class="form-group">
                    <label for="clientAdresse">Adresse :</label>
                    <textarea id="clientAdresse" name="adresse" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="clientDateNaissance">Date de naissance :</label>
                        <input type="date" id="clientDateNaissance" name="date_naissance">
                    </div>
                    <div class="form-group">
                        <label for="clientProfession">Profession :</label>
                        <input type="text" id="clientProfession" name="profession">
                    </div>
                </div>
                <div class="form-group">
                    <label for="clientNotes">Notes :</label>
                    <textarea id="clientNotes" name="notes" rows="3"></textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Enregistrer</button>
                    <button type="button" class="btn btn-secondary" onclick="closeClientModal()">Annuler</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Modal Dossier -->
    <div id="dossierModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="dossierModalTitle">Nouveau Dossier</h3>
                <button class="close-btn" onclick="closeDossierModal()">&times;</button>
            </div>
            <form id="dossierForm">
                <input type="hidden" id="dossierId">
                <div class="form-row">
                    <div class="form-group">
                        <label for="dossierNumero">Numero de dossier :</label>
                        <input type="text" id="dossierNumero" name="numero_dossier" required>
                    </div>
                    <div class="form-group">
                        <label for="dossierClient">Client :</label>
                        <select id="dossierClient" name="client_id" required>
                            <option value="">Selectionner un client</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="dossierTitre">Titre :</label>
                    <input type="text" id="dossierTitre" name="titre" required>
                </div>
                <div class="form-group">
                    <label for="dossierDescription">Description :</label>
                    <textarea id="dossierDescription" name="description" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="dossierType">Type d'affaire :</label>
                        <select id="dossierType" name="type_affaire">
                            <option value="">Selectionner un type</option>
                            <option value="Civil">Civil</option>
                            <option value="Penal">Penal</option>
                            <option value="Commercial">Commercial</option>
                            <option value="Famille">Famille</option>
                            <option value="Immobilier">Immobilier</option>
                            <option value="Travail">Travail</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="dossierPriorite">Priorite :</label>
                        <select id="dossierPriorite" name="priorite">
                            <option value="basse">Basse</option>
                            <option value="normale" selected>Normale</option>
                            <option value="haute">Haute</option>
                            <option value="urgente">Urgente</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="dossierAvocat">Avocat responsable :</label>
                    <input type="text" id="dossierAvocat" name="avocat_responsable">
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Enregistrer</button>
                    <button type="button" class="btn btn-secondary" onclick="closeDossierModal()">Annuler</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Modal Rendez-vous -->
    <div id="rdvModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="rdvModalTitle">Nouveau Rendez-vous</h3>
                <button class="close-btn" onclick="closeRdvModal()">&times;</button>
            </div>
            <form id="rdvForm">
                <input type="hidden" id="rdvId">
                <div class="form-group">
                    <label for="rdvTitre">Titre :</label>
                    <input type="text" id="rdvTitre" name="titre" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="rdvClient">Client :</label>
                        <select id="rdvClient" name="client_id" required>
                            <option value="">Selectionner un client</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="rdvDossier">Dossier (optionnel) :</label>
                        <select id="rdvDossier" name="dossier_id">
                            <option value="">Aucun dossier</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="rdvDate">Date et heure :</label>
                        <input type="datetime-local" id="rdvDate" name="date_rdv" required>
                    </div>
                    <div class="form-group">
                        <label for="rdvDuree">Duree (minutes) :</label>
                        <input type="number" id="rdvDuree" name="duree" value="60" min="15" max="480">
                    </div>
                </div>
                <div class="form-group">
                    <label for="rdvLieu">Lieu :</label>
                    <input type="text" id="rdvLieu" name="lieu">
                </div>
                <div class="form-group">
                    <label for="rdvDescription">Description :</label>
                    <textarea id="rdvDescription" name="description" rows="3"></textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Enregistrer</button>
                    <button type="button" class="btn btn-secondary" onclick="closeRdvModal()">Annuler</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        let currentUser = null;
        let clients = [];
        let dossiers = [];
        let rendezVous = [];
        
        if (authToken) {
            currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            showDashboard();
            loadAllData();
        }
        
        function showMessage(message, type = 'error') {
            const messageDiv = document.getElementById('loginMessage');
            if (messageDiv) {
                messageDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
                setTimeout(() => messageDiv.innerHTML = '', 5000);
            }
        }
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                showMessage('Connexion en cours...', 'loading');
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                if (response.ok) {
                    authToken = data.token;
                    currentUser = data.user;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showMessage('Connexion reussie !', 'success');
                    setTimeout(() => {
                        showDashboard();
                        loadAllData();
                    }, 1000);
                } else {
                    showMessage('Erreur: ' + data.error);
                }
            } catch (error) {
                showMessage('Erreur de connexion: ' + error.message);
            }
        });
        
        function showDashboard() {
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }
        
        function showSection(sectionName) {
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            document.getElementById(sectionName).classList.add('active');
            event.target.classList.add('active');
            
            switch(sectionName) {
                case 'clients': loadClients(); break;
                case 'dossiers': loadDossiers(); break;
                case 'rendez-vous': loadRendezVous(); break;
            }
        }
        
        async function loadAllData() {
            await Promise.all([loadClients(), loadDossiers(), loadRendezVous()]);
            updateStats();
        }
        
        function updateStats() {
            document.getElementById('clientCount').textContent = clients.length;
            document.getElementById('dossierCount').textContent = dossiers.length;
            document.getElementById('rdvCount').textContent = rendezVous.length;
        }
        
        async function loadClients() {
            try {
                const response = await fetch('/api/clients', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                if (response.ok) {
                    clients = await response.json();
                    displayClients();
                    updateClientSelects();
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        function displayClients() {
            const clientsList = document.getElementById('clientsList');
            if (clients.length === 0) {
                clientsList.innerHTML = '<p>Aucun client enregistre.</p>';
                return;
            }
            clientsList.innerHTML = clients.map(client => 
                '<div class="data-item">' +
                    '<div class="data-item-header">' +
                        '<div class="data-item-title">' + client.prenom + ' ' + client.nom + '</div>' +
                    '</div>' +
                    '<div class="data-item-info">' +
                        (client.email ? '<strong>Email :</strong> ' + client.email + '<br>' : '') +
                        (client.telephone ? '<strong>Telephone :</strong> ' + client.telephone + '<br>' : '') +
                        (client.profession ? '<strong>Profession :</strong> ' + client.profession : '') +
                    '</div>' +
                    '<div class="data-item-actions">' +
                        '<button class="btn btn-secondary btn-sm" onclick="editClient(' + client.id + ')">Modifier</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="deleteClient(' + client.id + ')">Supprimer</button>' +
                    '</div>' +
                '</div>'
            ).join('');
        }
        
        function updateClientSelects() {
            const selects = ['dossierClient', 'rdvClient'];
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (select) {
                    select.innerHTML = '<option value="">Selectionner un client</option>' +
                        clients.map(client => 
                            '<option value="' + client.id + '">' + client.prenom + ' ' + client.nom + '</option>'
                        ).join('');
                }
            });
        }
        
        async function loadDossiers() {
            try {
                const response = await fetch('/api/dossiers', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                if (response.ok) {
                    dossiers = await response.json();
                    displayDossiers();
                    updateDossierSelects();
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        function displayDossiers() {
            const dossiersList = document.getElementById('dossiersList');
            if (dossiers.length === 0) {
                dossiersList.innerHTML = '<p>Aucun dossier enregistre.</p>';
                return;
            }
            dossiersList.innerHTML = dossiers.map(dossier => 
                '<div class="data-item">' +
                    '<div class="data-item-header">' +
                        '<div class="data-item-title">' + dossier.titre + '</div>' +
                        '<span style="color: #667eea; font-weight: bold;">' + (dossier.statut || 'ouvert') + '</span>' +
                    '</div>' +
                    '<div class="data-item-info">' +
                        '<strong>Numero :</strong> ' + dossier.numero_dossier + '<br>' +
                        (dossier.nom ? '<strong>Client :</strong> ' + dossier.prenom + ' ' + dossier.nom + '<br>' : '') +
                        (dossier.type_affaire ? '<strong>Type :</strong> ' + dossier.type_affaire + '<br>' : '') +
                        (dossier.avocat_responsable ? '<strong>Avocat :</strong> ' + dossier.avocat_responsable : '') +
                    '</div>' +
                    '<div class="data-item-actions">' +
                        '<button class="btn btn-secondary btn-sm" onclick="editDossier(' + dossier.id + ')">Modifier</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="deleteDossier(' + dossier.id + ')">Supprimer</button>' +
                    '</div>' +
                '</div>'
            ).join('');
        }
        
        function updateDossierSelects() {
            const select = document.getElementById('rdvDossier');
            if (select) {
                select.innerHTML = '<option value="">Aucun dossier</option>' +
                    dossiers.map(dossier => 
                        '<option value="' + dossier.id + '">' + dossier.numero_dossier + ' - ' + dossier.titre + '</option>'
                    ).join('');
            }
        }
        
        async function loadRendezVous() {
            try {
                const response = await fetch('/api/rendez-vous', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                if (response.ok) {
                    rendezVous = await response.json();
                    displayRendezVous();
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        function displayRendezVous() {
            const rdvList = document.getElementById('rdvList');
            if (rendezVous.length === 0) {
                rdvList.innerHTML = '<p>Aucun rendez-vous programme.</p>';
                return;
            }
            rdvList.innerHTML = rendezVous.map(rdv => {
                const dateRdv = new Date(rdv.date_rdv);
                const dateStr = dateRdv.toLocaleDateString('fr-FR');
                const timeStr = dateRdv.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
                return '<div class="data-item">' +
                    '<div class="data-item-header">' +
                        '<div class="data-item-title">' + rdv.titre + '</div>' +
                        '<span style="color: #667eea; font-weight: bold;">' + dateStr + ' ' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="data-item-info">' +
                        (rdv.nom ? '<strong>Client :</strong> ' + rdv.prenom + ' ' + rdv.nom + '<br>' : '') +
                        (rdv.dossier_titre ? '<strong>Dossier :</strong> ' + rdv.dossier_titre + '<br>' : '') +
                        (rdv.lieu ? '<strong>Lieu :</strong> ' + rdv.lieu + '<br>' : '') +
                        '<strong>Duree :</strong> ' + (rdv.duree || 60) + ' minutes' +
                    '</div>' +
                    '<div class="data-item-actions">' +
                        '<button class="btn btn-secondary btn-sm" onclick="editRdv(' + rdv.id + ')">Modifier</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="deleteRdv(' + rdv.id + ')">Supprimer</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        
        // Modals
        function openClientModal(clientId = null) {
            const modal = document.getElementById('clientModal');
            const title = document.getElementById('clientModalTitle');
            const form = document.getElementById('clientForm');
            
            if (clientId) {
                const client = clients.find(c => c.id == clientId);
                if (client) {
                    title.textContent = 'Modifier Client';
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('clientPrenom').value = client.prenom || '';
                    document.getElementById('clientNom').value = client.nom || '';
                    document.getElementById('clientEmail').value = client.email || '';
                    document.getElementById('clientTelephone').value = client.telephone || '';
                    document.getElementById('clientAdresse').value = client.adresse || '';
                    document.getElementById('clientDateNaissance').value = client.date_naissance || '';
                    document.getElementById('clientProfession').value = client.profession || '';
                    document.getElementById('clientNotes').value = client.notes || '';
                }
            } else {
                title.textContent = 'Nouveau Client';
                form.reset();
                document.getElementById('clientId').value = '';
            }
            modal.classList.add('active');
        }
        
        function closeClientModal() {
            document.getElementById('clientModal').classList.remove('active');
        }
        
        function openDossierModal(dossierId = null) {
            const modal = document.getElementById('dossierModal');
            const title = document.getElementById('dossierModalTitle');
            const form = document.getElementById('dossierForm');
            updateClientSelects();
            
            if (dossierId) {
                const dossier = dossiers.find(d => d.id == dossierId);
                if (dossier) {
                    title.textContent = 'Modifier Dossier';
                    document.getElementById('dossierId').value = dossier.id;
                    document.getElementById('dossierNumero').value = dossier.numero_dossier || '';
                    document.getElementById('dossierClient').value = dossier.client_id || '';
                    document.getElementById('dossierTitre').value = dossier.titre || '';
                    document.getElementById('dossierDescription').value = dossier.description || '';
                    document.getElementById('dossierType').value = dossier.type_affaire || '';
                    document.getElementById('dossierPriorite').value = dossier.priorite || 'normale';
                    document.getElementById('dossierAvocat').value = dossier.avocat_responsable || '';
                }
            } else {
                title.textContent = 'Nouveau Dossier';
                form.reset();
                document.getElementById('dossierId').value = '';
                const nextNumber = String(dossiers.length + 1).padStart(4, '0');
                document.getElementById('dossierNumero').value = 'DOS-' + nextNumber;
            }
            modal.classList.add('active');
        }
        
        function closeDossierModal() {
            document.getElementById('dossierModal').classList.remove('active');
        }
        
        function openRdvModal(rdvId = null) {
            const modal = document.getElementById('rdvModal');
            const title = document.getElementById('rdvModalTitle');
            const form = document.getElementById('rdvForm');
            updateClientSelects();
            updateDossierSelects();
            
            if (rdvId) {
                const rdv = rendezVous.find(r => r.id == rdvId);
                if (rdv) {
                    title.textContent = 'Modifier Rendez-vous';
                    document.getElementById('rdvId').value = rdv.id;
                    document.getElementById('rdvTitre').value = rdv.titre || '';
                    document.getElementById('rdvClient').value = rdv.client_id || '';
                    document.getElementById('rdvDossier').value = rdv.dossier_id || '';
                    document.getElementById('rdvDate').value = rdv.date_rdv ? rdv.date_rdv.slice(0, 16) : '';
                    document.getElementById('rdvDuree').value = rdv.duree || 60;
                    document.getElementById('rdvLieu').value = rdv.lieu || '';
                    document.getElementById('rdvDescription').value = rdv.description || '';
                }
            } else {
                title.textContent = 'Nouveau Rendez-vous';
                form.reset();
                document.getElementById('rdvId').value = '';
                document.getElementById('rdvDuree').value = 60;
            }
            modal.classList.add('active');
        }
        
        function closeRdvModal() {
            document.getElementById('rdvModal').classList.remove('active');
        }
        
        // Formulaires
        document.getElementById('clientForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const clientId = document.getElementById('clientId').value;
            const formData = new FormData(e.target);
            const clientData = {};
            formData.forEach((value, key) => {
                clientData[key] = value || null;
            });
            
            try {
                const url = clientId ? '/api/clients/' + clientId : '/api/clients';
                const method = clientId ? 'PUT' : 'POST';
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(clientData)
                });
                
                if (response.ok) {
                    closeClientModal();
                    await loadClients();
                    updateStats();
                } else {
                    const error = await response.json();
                    alert('Erreur : ' + error.error);
                }
            } catch (error) {
                alert('Erreur : ' + error.message);
            }
        });
        
        document.getElementById('dossierForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const dossierId = document.getElementById('dossierId').value;
            const formData = new FormData(e.target);
            const dossierData = {};
            formData.forEach((value, key) => {
                dossierData[key] = value || null;
            });
            
            try {
                const url = dossierId ? '/api/dossiers/' + dossierId : '/api/dossiers';
                const method = dossierId ? 'PUT' : 'POST';
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(dossierData)
                });
                
                if (response.ok) {
                    closeDossierModal();
                    await loadDossiers();
                    updateStats();
                } else {
                    const error = await response.json();
                    alert('Erreur : ' + error.error);
                }
            } catch (error) {
                alert('Erreur : ' + error.message);
            }
        });
        
        document.getElementById('rdvForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const rdvId = document.getElementById('rdvId').value;
            const formData = new FormData(e.target);
            const rdvData = {};
            formData.forEach((value, key) => {
                rdvData[key] = value || null;
            });
            
            try {
                const url = rdvId ? '/api/rendez-vous/' + rdvId : '/api/rendez-vous';
                const method = rdvId ? 'PUT' : 'POST';
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(rdvData)
                });
                
                if (response.ok) {
                    closeRdvModal();
                    await loadRendezVous();
                    updateStats();
                } else {
                    const error = await response.json();
                    alert('Erreur : ' + error.error);
                }
            } catch (error) {
                alert('Erreur : ' + error.message);
            }
        });
        
        // Fonctions d'edition
        function editClient(clientId) { openClientModal(clientId); }
        function editDossier(dossierId) { openDossierModal(dossierId); }
        function editRdv(rdvId) { openRdvModal(rdvId); }
        
        // Fonctions de suppression
        async function deleteClient(clientId) {
            if (confirm('Etes-vous sur de vouloir supprimer ce client ?')) {
                try {
                    const response = await fetch('/api/clients/' + clientId, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + authToken }
                    });
                    if (response.ok) {
                        await loadClients();
                        updateStats();
                    } else {
                        const error = await response.json();
                        alert('Erreur : ' + error.error);
                    }
                } catch (error) {
                    alert('Erreur : ' + error.message);
                }
            }
        }
        
        async function deleteDossier(dossierId) {
            if (confirm('Etes-vous sur de vouloir supprimer ce dossier ?')) {
                try {
                    const response = await fetch('/api/dossiers/' + dossierId, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + authToken }
                    });
                    if (response.ok) {
                        await loadDossiers();
                        updateStats();
                    } else {
                        const error = await response.json();
                        alert('Erreur : ' + error.error);
                    }
                } catch (error) {
                    alert('Erreur : ' + error.message);
                }
            }
        }
        
        async function deleteRdv(rdvId) {
            if (confirm('Etes-vous sur de vouloir supprimer ce rendez-vous ?')) {
                try {
                    const response = await fetch('/api/rendez-vous/' + rdvId, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + authToken }
                    });
                    if (response.ok) {
                        await loadRendezVous();
                        updateStats();
                    } else {
                        const error = await response.json();
                        alert('Erreur : ' + error.error);
                    }
                } catch (error) {
                    alert('Erreur : ' + error.message);
                }
            }
        }
        
        function logout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            location.reload();
        }
        
        // Fermeture des modals en cliquant en dehors
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
    </script>
</body>
</html>`);
});

// Route de sante
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Demarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cabinet d'Avocats demarre sur le port ${PORT}`);
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
