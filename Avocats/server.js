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
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

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

// Middlewares de sécurité (adaptés pour servir du HTML)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Middleware pour parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configuration multer pour upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

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

// Routes API - Authentification
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Identifiants invalides' });
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
            
            <form id="login">
                <div class="form-group">
                    <label for="email">Email :</label>
                    <input type="email" id="email" name="email" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit" class="btn">Se connecter</button>
            </form>
            
            <div class="test-accounts">
                <h3>Compte de test :</h3>
                <strong>admin@cabinet.com</strong> / <strong>admin123</strong>
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
                        <p>Votre système de gestion est opérationnel. Vous pouvez maintenant :</p>
                        <ul style="margin: 1rem 0; padding-left: 2rem;">
                            <li>Gérer vos clients</li>
                            <li>Créer et suivre des dossiers</li>
                            <li>Planifier des rendez-vous</li>
                            <li>Uploader des documents</li>
                        </ul>
                    </div>
                </div>
                
                <div id="clients" class="section" style="display: none;">
                    <div class="card">
                        <h3>👥 Gestion des Clients</h3>
                        <p>Liste des clients sera affichée ici.</p>
                        <button class="btn" onclick="loadClients()">Charger les clients</button>
                        <div id="clientList"></div>
                    </div>
                </div>
                
                <div id="dossiers" class="section" style="display: none;">
                    <div class="card">
                        <h3>📁 Gestion des Dossiers</h3>
                        <p>Liste des dossiers sera affichée ici.</p>
                        <button class="btn" onclick="loadDossiers()">Charger les dossiers</button>
                        <div id="dossierList"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        
        // Vérifier si déjà connecté au chargement
        if (authToken) {
            showDashboard();
        }
        
        // Gestion du formulaire de connexion
        document.getElementById('login').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
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
                    showDashboard();
                    loadStats();
                } else {
                    alert('Erreur de connexion: ' + data.error);
                }
            } catch (error) {
                alert('Erreur: ' + error.message);
            }
        });
        
        function showDashboard() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }
        
        function showSection(sectionName) {
            // Cacher toutes les sections
            document.querySelectorAll('.section').forEach(section => {
                section.style.display = 'none';
            });
            
            // Retirer la classe active de tous les liens
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            // Afficher la section demandée
            document.getElementById(sectionName).style.display = 'block';
            
            // Ajouter la classe active au lien cliqué
            event.target.classList.add('active');
        }
        
        async function loadStats() {
            try {
                // Charger les clients
                const clientsResponse = await fetch('/api/clients', {
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
                });
                
                if (clientsResponse.ok) {
                    const clients = await clientsResponse.json();
                    document.getElementById('clientCount').textContent = clients.length;
                }
                
                // Charger les dossiers
                const dossiersResponse = await fetch('/api/dossiers', {
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
                });
                
                if (dossiersResponse.ok) {
                    const dossiers = await dossiersResponse.json();
                    document.getElementById('dossierCount').textContent = dossiers.length;
                }
                
                // Charger les rendez-vous
                const rdvResponse = await fetch('/api/rendez-vous', {
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
                });
                
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
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
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
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
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
