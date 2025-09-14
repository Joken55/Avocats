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

// Middlewares de sécurité (adaptés pour Railway)
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

app.post('/create-admin', async (req, res) => {
  try {
    const existingAdmin = await pool.query("SELECT * FROM users WHERE email = 'admin@cabinet.com'");
    
    if (existingAdmin.rows.length > 0) {
      return res.json({ 
        message: 'Admin déjà existant', 
        admin: existingAdmin.rows[0].email 
      });
    }

    const passwordHash = await bcrypt.hash('admin123', 10);
    
    const result = await pool.query(`
      INSERT INTO users (username, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, username, email, role
    `, ['admin', 'admin@cabinet.com', passwordHash, 'admin']);
    
    res.json({ 
      message: '✅ Admin créé avec succès!', 
      user: result.rows[0] 
    });
    
  } catch (error) {
    console.error('Erreur création admin:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création', 
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

// Route principale - Interface web
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cabinet d'Avocats - GTA5 RP</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            background: white;
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .logo h1 {
            color: #2d3748;
            font-size: 1.8rem;
            margin-bottom: 0.5rem;
        }
        
        .logo p {
            color: #718096;
            font-size: 0.9rem;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #2d3748;
            font-weight: 500;
        }
        
        input[type="email"], input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        input[type="email"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 0.75rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        .btn:hover {
            transform: translateY(-2px);
        }
        
        .test-accounts {
            margin-top: 2rem;
            padding: 1rem;
            background: #f7fafc;
            border-radius: 8px;
            font-size: 0.8rem;
            color: #4a5568;
        }
        
        .test-accounts h3 {
            margin-bottom: 0.5rem;
            color: #2d3748;
        }
        
        .dashboard {
            display: none;
        }
        
        .dashboard.active {
            display: block;
        }
        
        .navbar {
            background: #2d3748;
            color: white;
            padding: 1rem;
            margin: -2rem -2rem 2rem -2rem;
            border-radius: 15px 15px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .nav-links {
            display: flex;
            gap: 1rem;
        }
        
        .nav-link {
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            font-size: 0.9rem;
        }
        
        .nav-link:hover, .nav-link.active {
            background: rgba(255,255,255,0.2);
        }
        
        .content {
            min-height: 400px;
        }
        
        .card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }
        
        .card h3 {
            color: #2d3748;
            margin-bottom: 1rem;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            color: #718096;
            font-size: 0.9rem;
        }
        
        .error {
            background: #fed7d7;
            color: #c53030;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }
        
        .success {
            background: #c6f6d5;
            color: #2f855a;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
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
                
                <button type="submit" class="btn">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Debug :</h3>
                <button onclick="window.open('/debug-db')" style="margin: 5px; padding: 5px 10px;">Test DB</button>
                <button onclick="window.open('/debug-users')" style="margin: 5px; padding: 5px 10px;">Voir Users</button>
                <button onclick="window.open('/create-admin')" style="margin: 5px; padding: 5px 10px;">Créer Admin</button>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboard" class="dashboard">
            <div class="navbar">
                <h2>📋 Dashboard</h2>
                <div class="nav-links">
                    <button class="nav-link active" onclick="showSection('overview')">Aperçu</button>
                    <button class="nav-link" onclick="showSection('clients')">Clients</button>
                    <button class="nav-link" onclick="showSection('dossiers')">Dossiers</button>
                    <button class="nav-link" onclick="logout()">Déconnexion</button>
                </div>
            </div>
            
            <div class="content">
                <div id="overview" class="section">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number" id="clientCount">0</div>
                            <div class="stat-label">Clients</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number" id="dossierCount">0</div>
                            <div class="stat-label">Dossiers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number" id="rdvCount">0</div>
                            <div class="stat-label">RDV à venir</div>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>🎉 Bienvenue dans votre Cabinet d'Avocats !</h3>
                        <p>Votre système de gestion est opérationnel.</p>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="card">
                        <h3>👥 Gestion des Clients</h3>
                        <button class="btn" onclick="loadClients()">Charger les clients</button>
                        <div id="clientList"></div>
                    </div>
                </div>
                
                <div id="dossiers" class="section" style="display: none;">
                    <div class="card">
                        <h3>📁 Gestion des Dossiers</h3>
                        <button class="btn" onclick="loadDossiers()">Charger les dossiers</button>
                        <div id="dossierList"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        
        function showMessage(message, type = 'error') {
            const messageDiv = document.getElementById('loginMessage');
            messageDiv.innerHTML = \`<div class="\${type}">\${message}</div>\`;
            setTimeout(() => messageDiv.innerHTML = '', 5000);
        }
        
        if (authToken) {
            showDashboard();
        }
        
        document.getElementById('login').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                showMessage('Connexion en cours...', 'success');
                
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    authToken = data.token;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showMessage('Connexion réussie !', 'success');
                    setTimeout(() => {
                        showDashboard();
                        loadStats();
                    }, 1000);
                } else {
                    showMessage('Erreur: ' + data.error);
                }
            } catch (error) {
                showMessage('Erreur de connexion: ' + error.message);
                console.error('Erreur:', error);
            }
        });
        
        function showDashboard() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }
        
        function showSection(sectionName) {
            document.querySelectorAll('.section').forEach(section => {
                section.style.display = 'none';
            });
            
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            document.getElementById(sectionName).style.display = 'block';
            event.target.classList.add('active');
        }
        
        async function loadStats() {
            try {
                const [clientsResponse, dossiersResponse, rdvResponse] = await Promise.all([
                    fetch('/api/clients', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/dossiers', { headers: { 'Authorization': 'Bearer ' + authToken } }),
                    fetch('/api/rendez-vous', { headers: { 'Authorization': 'Bearer ' + authToken } })
                ]);
                
                if (clientsResponse.ok) {
                    const clients = await clientsResponse.json();
                    document.getElementById('clientCount').textContent = clients.length;
                }
                
                if (dossiersResponse.ok) {
                    const dossiers = await dossiersResponse.json();
                    document.getElementById('dossierCount').textContent = dossiers.length;
                }
                
                if (rdvResponse.ok) {
                    const rdvs = await rdvResponse.json();
                    document.getElementById('rdvCount').textContent = rdvs.length;
                }
            } catch (error) {
                console.error('Erreur chargement stats:', error);
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
                        clientList.innerHTML = clients.map(client => \`
                            <div style="padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0.5rem 0;">
                                <strong>\${client.prenom} \${client.nom}</strong><br>
                                📧 \${client.email || 'N/A'}<br>
                                📞 \${client.telephone || 'N/A'}
                            </div>
                        \`).join('');
                    }
                } else {
                    document.getElementById('clientList').innerHTML = '<p>Erreur lors du chargement des clients.</p>';
                }
            } catch (error) {
                console.error('Erreur:', error);
                document.getElementById('clientList').innerHTML = '<p>Erreur lors du chargement des clients.</p>';
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
                        dossierList.innerHTML = dossiers.map(dossier => \`
                            <div style="padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0.5rem 0;">
                                <strong>\${dossier.titre}</strong><br>
                                📂 \${dossier.numero_dossier}<br>
                                👤 \${dossier.prenom} \${dossier.nom}<br>
                                📊 \${dossier.statut}
                            </div>
                        \`).join('');
                    }
                } else {
                    document.getElementById('dossierList').innerHTML = '<p>Erreur lors du chargement des dossiers.</p>';
                }
            } catch (error) {
                console.error('Erreur:', error);
                document.getElementById('dossierList').innerHTML = '<p>Erreur lors du chargement des dossiers.</p>';
            }
        }
        
        function logout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            location.reload();
        }
    </script>
</body>
</html>
  `);
});

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
});
