}
        
        // Mise a jour des selects de clients
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
        
        // Chargement des dossiers
        async function loadDossiers() {
            try {
                const response = await fetch('/api/dossiers', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    dossiers = await response.json();
                    displayDossiers();
                    updateDossierSelects();
                } else {
                    console.error('Erreur chargement dossiers');
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        // Affichage des dossiers
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
        
        // Mise a jour des selects de dossiers
        function updateDossierSelects() {
            const select = document.getElementById('rdvDossier');
            if (select) {
                select.innerHTML = '<option value="">Aucun dossier</option>' +
                    dossiers.map(dossier => 
                        '<option value="' + dossier.id + '">' + dossier.numero_dossier + ' - ' + dossier.titre + '</option>'
                    ).join('');
            }
        }
        
        // Chargement des rendez-vous
        async function loadRendezVous() {
            try {
                const response = await fetch('/api/rendez-vous', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                
                if (response.ok) {
                    rendezVous = await response.json();
                    displayRendezVous();
                } else {
                    console.error('Erreur chargement rendez-vous');
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
        
        // Affichage des rendez-vous
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
        
        // === GESTION DES MODALS ===
        
        // Modal Client
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
        
        // Modal Dossier
        function openDossierModal(dossierId = null) {
            const modal = document.getElementById('dossierModal');
            const title = document.getElementById('dossierModalTitle');
            const form = document.getElementById('dossierForm');
            
            updateClientSelects(); // Mettre a jour la liste des clients
            
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
                // Generer automatiquement un numero de dossier
                const nextNumber = String(dossiers.length + 1).padStart(4, '0');
                document.getElementById('dossierNumero').value = 'DOS-' + nextNumber;
            }
            
            modal.classList.add('active');
        }
        
        function closeDossierModal() {
            document.getElementById('dossierModal').classList.remove('active');
        }
        
        // Modal Rendez-vous
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
        
        // === GESTION DES FORMULAIRES ===
        
        // Formulaire Client
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
        
        // Formulaire Dossier
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
        
        // Formulaire Rendez-vous
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
        
        // === FONCTIONS D'EDITION ===
        
        function editClient(clientId) {
            openClientModal(clientId);
        }
        
        function editDossier(dossierId) {
            openDossierModal(dossierId);
        }
        
        function editRdv(rdvId) {
            openRdvModal(rdvId);
        }
        
        // === FONCTIONS DE SUPPRESSION ===
        
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
        
        // Deconnexion
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
</html>
  `);
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_numero ON dossiers(numero_dossier)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_dossiers_client ON dossiers(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_date ON rendez_vous(date_rdv)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rdv_client ON rendez_vous(client_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents(dossier_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notes_dossier ON notes(dossier_id)');

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
      tables_created: ['users', 'clients', 'dossiers', 'rendez_vous', 'documents', 'notes'],
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

app.get('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouve' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur recuperation client:', error);
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
    console.error('Erreur mise a jour client:', error);
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
    console.error('Erreur suppression client:', error);
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

app.post('/api/dossiers', authenticateToken, async (req, res) => {
  try {
    const { numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite } = req.body;
    
    const result = await pool.query(
      'INSERT INTO dossiers (numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [numero_dossier, client_id, titre, description, type_affaire, avocat_responsable, priorite]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur creation dossier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/dossiers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT d.*, c.nom, c.prenom 
      FROM dossiers d 
      LEFT JOIN clients c ON d.client_id = c.id 
      WHERE d.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur recuperation dossier:', error);
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
    console.error('Erreur mise a jour dossier:', error);
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
    console.error('Erreur suppression dossier:', error);
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

app.post('/api/rendez-vous', authenticateToken, async (req, res) => {
  try {
    const { client_id, dossier_id, titre, description, date_rdv, duree, lieu } = req.body;
    
    const result = await pool.query(
      'INSERT INTO rendez_vous (client_id, dossier_id, titre, description, date_rdv, duree, lieu) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [client_id, dossier_id, titre, description, date_rdv, duree, lieu]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur creation rendez-vous:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route principale - Interface web complète
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
        }
        
        .container {
            background: white;
            margin: 20px auto;
            border-radius: 15px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            width: 95%;
            max-width: 1200px;
            overflow: hidden;
        }
        
        .login-container {
            padding: 3rem;
            text-align: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .login-box {
            background: white;
            padding: 3rem;
            border-radius: 15px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
        }
        
        .logo {
            margin-bottom: 2rem;
        }
        
        .logo h1 {
            color: #2d3748;
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        
        .logo p {
            color: #718096;
            font-size: 1rem;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
            text-align: left;
        }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #2d3748;
            font-weight: 500;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            width: 100%;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 15px rgba(102, 126, 234, 0.4);
        }
        
        .btn-secondary {
            background: #f7fafc;
            color: #4a5568;
            border: 2px solid #e2e8f0;
        }
        
        .btn-secondary:hover {
            background: #edf2f7;
        }
        
        .btn-success {
            background: #48bb78;
            color: white;
        }
        
        .btn-danger {
            background: #f56565;
            color: white;
        }
        
        .btn-sm {
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
        }
        
        .test-accounts {
            margin-top: 2rem;
            padding: 1rem;
            background: #f7fafc;
            border-radius: 8px;
            font-size: 0.9rem;
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
            background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%);
            color: white;
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }
        
        .navbar h2 {
            margin: 0;
            font-size: 1.5rem;
        }
        
        .nav-links {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        
        .nav-link {
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s;
        }
        
        .nav-link:hover, .nav-link.active {
            background: rgba(255,255,255,0.2);
            transform: translateY(-1px);
        }
