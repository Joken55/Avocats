const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
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

// Servir les fichiers statiques
app.use(express.static('public'));

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

// Route principale - redirige vers le fichier HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cabinet d'Avocats demarre sur le port ${PORT}`);
  console.log(`Interface: http://localhost:${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
