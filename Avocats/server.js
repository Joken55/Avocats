// server.js - Backend pour Railway (version corrigée)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration PostgreSQL Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Variable pour tracker l'initialisation
let dbInitialized = false;

// Fonction d'initialisation de la base de données
async function initializeDatabase() {
  if (dbInitialized) return;
  
  console.log('🔧 Initialisation de la base de données...');
  
  try {
    // Test de connexion avec retry
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      try {
        const client = await pool.connect();
        console.log('✅ Connexion PostgreSQL réussie');
        client.release();
        break;
      } catch (error) {
        attempts++;
        console.log(`⏳ Tentative de connexion ${attempts}/${maxAttempts}...`);
        if (attempts >= maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Lire et exécuter le schema
    console.log('📋 Création des tables...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Tables créées avec succès');
    } else {
      // Schema inline si le fichier n'existe pas
      await createTablesInline();
    }
    
    // Vérifier les tables
    const tables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('📊 Tables disponibles:', tables.rows.map(t => t.tablename).join(', '));
    
    dbInitialized = true;
    console.log('🎉 Base de données initialisée avec succès');
    
  } catch (error) {
    console.error('❌ Erreur initialisation DB:', error);
    // Ne pas faire planter l'app, retenter plus tard
  }
}

async function createTablesInline() {
  console.log('📋 Création des tables (inline)...');
  
  // Table employés
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      salary INTEGER NOT NULL,
      commission INTEGER NOT NULL,
      hire_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'Actif',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table affaires
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id SERIAL PRIMARY KEY,
      client VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      lawyer VARCHAR(255) NOT NULL,
      honoraires INTEGER NOT NULL,
      frais INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'En cours',
      description TEXT,
      week VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table services
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      type VARCHAR(255) NOT NULL UNIQUE,
      tarif INTEGER NOT NULL,
      forfait VARCHAR(100),
      commission INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Index
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cases_week ON cases(week);
    CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(lawyer);
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
  `);
  
  // Données initiales employés
  await pool.query(`
    INSERT INTO employees (name, role, salary, commission, hire_date, status) VALUES
    ('Marie Dubois', 'Associé Senior', 8000, 30, '2023-01-15', 'Actif'),
    ('Pierre Martin', 'Avocat', 5500, 25, '2023-03-20', 'Actif'),
    ('Sophie Leroy', 'Avocat Junior', 3500, 20, '2024-01-10', 'Actif'),
    ('Lucas Bernard', 'Stagiaire', 1800, 15, '2024-09-05', 'Actif')
    ON CONFLICT (name) DO NOTHING
  `);
  
  // Données initiales services
  await pool.query(`
    INSERT INTO services (type, tarif, forfait, commission) VALUES
    ('Consultation', 150, '-', 20),
    ('Affaire Pénale', 250, '3000€', 25),
    ('Divorce', 200, '2500€', 20),
    ('Commercial', 300, '5000€', 30),
    ('Immobilier', 180, '1500€', 18)
    ON CONFLICT (type) DO NOTHING
  `);
  
  // Données d'exemple pour la semaine courante
  const currentWeek = getCurrentWeek();
  await pool.query(`
    INSERT INTO cases (client, type, lawyer, honoraires, frais, status, description, week) VALUES
    ('Jean Dupont', 'Divorce', 'Marie Dubois', 3000, 200, 'Terminé', 'Divorce contentieux', $1),
    ('SAS Tech', 'Commercial', 'Pierre Martin', 5000, 350, 'En cours', 'Litige contractuel', $1),
    ('Mme Leclerc', 'Immobilier', 'Sophie Leroy', 2500, 150, 'Terminé', 'Vente propriété', $1)
    ON CONFLICT DO NOTHING
  `, [currentWeek]);
}

// Middleware pour vérifier l'initialisation DB
async function ensureDbInitialized(req, res, next) {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
    } catch (error) {
      return res.status(503).json({ 
        error: 'Base de données en cours d\'initialisation', 
        retry: true 
      });
    }
  }
  next();
}

// AUTHENTIFICATION SIMPLE
const users = {
  'admin': { password: 'admin123', grade: 'Directeur' },
  'marie': { password: 'marie123', grade: 'Associé Senior' },
  'pierre': { password: 'pierre123', grade: 'Avocat' },
  'sophie': { password: 'sophie123', grade: 'Avocat Junior' }
};

// Middleware d'authentification
function authenticate(req, res, next) {
  const { username, password } = req.headers;
  
  if (users[username] && users[username].password === password) {
    req.user = { username, grade: users[username].grade };
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
  }
}

// Middleware de permissions
function checkPermission(action) {
  return (req, res, next) => {
    const grade = req.user.grade;
    const permissions = {
      'Directeur': ['read', 'create', 'update', 'delete'],
      'Associé Senior': ['read', 'create', 'update'],
      'Avocat': ['read', 'create'],
      'Avocat Junior': ['read', 'create'],
      'Stagiaire': ['read'],
      'Secrétaire': ['read']
    };
    
    if (permissions[grade]?.includes(action)) {
      next();
    } else {
      res.status(403).json({ error: 'Permission refusée' });
    }
  };
}

// ===== ROUTES API =====

// Route de test (sans authentification pour healthcheck)
app.get('/api/test', async (req, res) => {
  try {
    if (!dbInitialized) {
      await initializeDatabase();
    }
    
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      message: 'API Cabinet d\'Avocats opérationnelle',
      timestamp: new Date(),
      db_connected: true,
      db_time: result.rows[0].now
    });
  } catch (error) {
    res.status(503).json({ 
      message: 'API opérationnelle, DB en initialisation',
      timestamp: new Date(),
      db_connected: false,
      error: error.message
    });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (users[username] && users[username].password === password) {
    res.json({ 
      success: true, 
      user: { username, grade: users[username].grade }
    });
  } else {
    res.status(401).json({ success: false, error: 'Identifiants incorrects' });
  }
});

// ===== EMPLOYÉS =====

// Récupérer tous les employés
app.get('/api/employees', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET employees:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un employé
app.post('/api/employees', ensureDbInitialized, authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { name, role, salary, commission, date, status } = req.body;
    
    const result = await pool.query(
      'INSERT INTO employees (name, role, salary, commission, hire_date, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, role, salary, commission, date, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST employee:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'employé' });
  }
});

// Modifier un employé
app.put('/api/employees/:id', ensureDbInitialized, authenticate, checkPermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, salary, commission, date, status } = req.body;
    
    const result = await pool.query(
      'UPDATE employees SET name = $1, role = $2, salary = $3, commission = $4, hire_date = $5, status = $6, updated_at = NOW() WHERE id = $7 RETURNING *',
      [name, role, salary, commission, date, status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT employee:', err);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// Supprimer un employé
app.delete('/api/employees/:id', ensureDbInitialized, authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    res.json({ message: 'Employé supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE employee:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== AFFAIRES =====

// Récupérer les affaires de la semaine courante
app.get('/api/cases/current', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cases WHERE week = $1 ORDER BY created_at DESC', [getCurrentWeek()]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET current cases:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter une affaire
app.post('/api/cases', ensureDbInitialized, authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { client, type, lawyer, honoraires, frais, status, description } = req.body;
    const week = getCurrentWeek();
    
    const result = await pool.query(
      'INSERT INTO cases (client, type, lawyer, honoraires, frais, status, description, week) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [client, type, lawyer, honoraires, frais, status, description, week]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST case:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'affaire' });
  }
});

// Modifier seulement le statut d'une affaire
app.put('/api/cases/:id/status', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT case status:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du statut' });
  }
});

// Supprimer une affaire
app.delete('/api/cases/:id', ensureDbInitialized, authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM cases WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json({ message: 'Affaire supprimée avec succès' });
  } catch (err) {
    console.error('Erreur DELETE case:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== SERVICES =====

// Récupérer tous les services
app.get('/api/services', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY type');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET services:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un service
app.post('/api/services', ensureDbInitialized, authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { type, tarif, forfait, commission } = req.body;
    
    const result = await pool.query(
      'INSERT INTO services (type, tarif, forfait, commission) VALUES ($1, $2, $3, $4) RETURNING *',
      [type, tarif, forfait, commission]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST service:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du service' });
  }
});

// Modifier un service
app.put('/api/services/:id', ensureDbInitialized, authenticate, checkPermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, tarif, forfait, commission } = req.body;
    
    const result = await pool.query(
      'UPDATE services SET type = $1, tarif = $2, forfait = $3, commission = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [type, tarif, forfait, commission, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT service:', err);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// Supprimer un service
app.delete('/api/services/:id', ensureDbInitialized, authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    res.json({ message: 'Service supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE service:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== STATISTIQUES =====

// Récupérer les statistiques du dashboard
app.get('/api/stats/dashboard', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const week = getCurrentWeek();
    
    // Statistiques de la semaine courante
    const currentWeekStats = await pool.query(`
      SELECT 
        COUNT(*) as total_cases,
        COALESCE(SUM(honoraires), 0) as total_revenue,
        COALESCE(SUM(frais), 0) as total_expenses,
        COALESCE(SUM(honoraires) - SUM(frais), 0) as total_profit
      FROM cases WHERE week = $1
    `, [week]);
    
    // Statistiques employés actifs
    const employeeStats = await pool.query(`
      SELECT COUNT(*) as active_employees 
      FROM employees WHERE status = 'Actif'
    `);
    
    res.json({
      current_week: currentWeekStats.rows[0],
      employees: employeeStats.rows[0]
    });
    
  } catch (err) {
    console.error('Erreur GET dashboard stats:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== SALAIRES =====

// Calculer les salaires
app.get('/api/salaries', ensureDbInitialized, authenticate, async (req, res) => {
  try {
    const week = getCurrentWeek();
    
    const employees = await pool.query('SELECT * FROM employees WHERE status = \'Actif\'');
    const cases = await pool.query('SELECT * FROM cases WHERE week = $1', [week]);
    
    const salaries = employees.rows.map(emp => {
      const employeeCases = cases.rows.filter(c => c.lawyer === emp.name);
      const totalCommissions = employeeCases.reduce((sum, c) => sum + (c.honoraires * emp.commission / 100), 0);
      const performanceBonus = employeeCases.length > 3 ? emp.salary * 0.1 : 0;
      const totalSalary = emp.salary + totalCommissions + performanceBonus;
      
      return {
        ...emp,
        cases_count: employeeCases.length,
        commissions: Math.round(totalCommissions),
        performance_bonus: Math.round(performanceBonus),
        total_salary: Math.round(totalSalary)
      };
    });
    
    res.json(salaries);
  } catch (err) {
    console.error('Erreur GET salaries:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== UTILITAIRES =====

// Fonction pour obtenir la semaine courante
function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Route pour servir le frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialiser la base de données au démarrage
initializeDatabase().catch(console.error);

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 Frontend disponible sur http://localhost:${PORT}`);
  console.log(`🔌 API disponible sur http://localhost:${PORT}/api`);
});

module.exports = app;

// AUTHENTIFICATION SIMPLE
const userData = {
  'admin': { password: 'admin123', grade: 'Directeur' },
  'marie': { password: 'marie123', grade: 'Associé Senior' },
  'pierre': { password: 'pierre123', grade: 'Avocat' },
  'sophie': { password: 'sophie123', grade: 'Avocat Junior' }
};

// Middleware d'authentification
function authenticate(req, res, next) {
  const { username, password } = req.headers;
  
  if (users[username] && users[username].password === password) {
    req.user = { username, grade: users[username].grade };
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
  }
}

// Middleware de permissions
function checkPermission(action) {
  return (req, res, next) => {
    const grade = req.user.grade;
    const permissions = {
      'Directeur': ['read', 'create', 'update', 'delete'],
      'Associé Senior': ['read', 'create', 'update'],
      'Avocat': ['read', 'create'],
      'Avocat Junior': ['read', 'create'],
      'Stagiaire': ['read'],
      'Secrétaire': ['read']
    };
    
    if (permissions[grade]?.includes(action)) {
      next();
    } else {
      res.status(403).json({ error: 'Permission refusée' });
    }
  };
}

// ===== ROUTES API =====

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API Cabinet d\'Avocats opérationnelle', timestamp: new Date() });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (users[username] && users[username].password === password) {
    res.json({ 
      success: true, 
      user: { username, grade: users[username].grade }
    });
  } else {
    res.status(401).json({ success: false, error: 'Identifiants incorrects' });
  }
});

// ===== EMPLOYÉS =====

// Récupérer tous les employés
app.get('/api/employees', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET employees:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un employé
app.post('/api/employees', authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { name, role, salary, commission, date, status } = req.body;
    
    const result = await pool.query(
      'INSERT INTO employees (name, role, salary, commission, hire_date, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, role, salary, commission, date, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST employee:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'employé' });
  }
});

// Modifier un employé
app.put('/api/employees/:id', authenticate, checkPermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, salary, commission, date, status } = req.body;
    
    const result = await pool.query(
      'UPDATE employees SET name = $1, role = $2, salary = $3, commission = $4, hire_date = $5, status = $6, updated_at = NOW() WHERE id = $7 RETURNING *',
      [name, role, salary, commission, date, status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT employee:', err);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// Supprimer un employé
app.delete('/api/employees/:id', authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    res.json({ message: 'Employé supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE employee:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== AFFAIRES =====

// Récupérer les affaires de la semaine courante
app.get('/api/cases/current', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cases WHERE week = $1 ORDER BY created_at DESC', [getCurrentWeek()]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET current cases:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter une affaire
app.post('/api/cases', authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { client, type, lawyer, honoraires, frais, status, description } = req.body;
    const week = getCurrentWeek();
    
    const result = await pool.query(
      'INSERT INTO cases (client, type, lawyer, honoraires, frais, status, description, week) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [client, type, lawyer, honoraires, frais, status, description, week]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST case:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'affaire' });
  }
});

// Modifier une affaire
app.put('/api/cases/:id', authenticate, checkPermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { client, type, lawyer, honoraires, frais, status, description } = req.body;
    
    const result = await pool.query(
      'UPDATE cases SET client = $1, type = $2, lawyer = $3, honoraires = $4, frais = $5, status = $6, description = $7, updated_at = NOW() WHERE id = $8 RETURNING *',
      [client, type, lawyer, honoraires, frais, status, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT case:', err);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// Modifier seulement le statut d'une affaire
app.put('/api/cases/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT case status:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du statut' });
  }
});

// Supprimer une affaire
app.delete('/api/cases/:id', authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM cases WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json({ message: 'Affaire supprimée avec succès' });
  } catch (err) {
    console.error('Erreur DELETE case:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== SERVICES =====

// Récupérer tous les services
app.get('/api/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY type');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET services:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un service
app.post('/api/services', authenticate, checkPermission('create'), async (req, res) => {
  try {
    const { type, tarif, forfait, commission } = req.body;
    
    const result = await pool.query(
      'INSERT INTO services (type, tarif, forfait, commission) VALUES ($1, $2, $3, $4) RETURNING *',
      [type, tarif, forfait, commission]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST service:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du service' });
  }
});

// Modifier un service
app.put('/api/services/:id', authenticate, checkPermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, tarif, forfait, commission } = req.body;
    
    const result = await pool.query(
      'UPDATE services SET type = $1, tarif = $2, forfait = $3, commission = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [type, tarif, forfait, commission, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT service:', err);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// Supprimer un service
app.delete('/api/services/:id', authenticate, checkPermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    res.json({ message: 'Service supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE service:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// ===== HISTORIQUE =====

// Récupérer les données d'une semaine spécifique
app.get('/api/history/:week', authenticate, async (req, res) => {
  try {
    const { week } = req.params;
    
    const result = await pool.query('SELECT * FROM cases WHERE week = $1 ORDER BY created_at DESC', [week]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET history:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer la liste des semaines disponibles
app.get('/api/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT week FROM cases ORDER BY week DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET history weeks:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== STATISTIQUES =====

// Récupérer les statistiques du dashboard
app.get('/api/stats/dashboard', authenticate, async (req, res) => {
  try {
    const week = getCurrentWeek();
    
    // Statistiques de la semaine courante
    const currentWeekStats = await pool.query(`
      SELECT 
        COUNT(*) as total_cases,
        COALESCE(SUM(honoraires), 0) as total_revenue,
        COALESCE(SUM(frais), 0) as total_expenses,
        COALESCE(SUM(honoraires) - SUM(frais), 0) as total_profit
      FROM cases WHERE week = $1
    `, [week]);
    
    // Statistiques employés actifs
    const employeeStats = await pool.query(`
      SELECT COUNT(*) as active_employees 
      FROM employees WHERE status = 'Actif'
    `);
    
    res.json({
      current_week: currentWeekStats.rows[0],
      employees: employeeStats.rows[0]
    });
    
  } catch (err) {
    console.error('Erreur GET dashboard stats:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== SALAIRES =====

// Calculer les salaires
app.get('/api/salaries', authenticate, async (req, res) => {
  try {
    const week = getCurrentWeek();
    
    const employees = await pool.query('SELECT * FROM employees WHERE status = \'Actif\'');
    const cases = await pool.query('SELECT * FROM cases WHERE week = $1', [week]);
    
    const salaries = employees.rows.map(emp => {
      const employeeCases = cases.rows.filter(c => c.lawyer === emp.name);
      const totalCommissions = employeeCases.reduce((sum, c) => sum + (c.honoraires * emp.commission / 100), 0);
      const performanceBonus = employeeCases.length > 3 ? emp.salary * 0.1 : 0;
      const totalSalary = emp.salary + totalCommissions + performanceBonus;
      
      return {
        ...emp,
        cases_count: employeeCases.length,
        commissions: Math.round(totalCommissions),
        performance_bonus: Math.round(performanceBonus),
        total_salary: Math.round(totalSalary)
      };
    });
    
    res.json(salaries);
  } catch (err) {
    console.error('Erreur GET salaries:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== UTILITAIRES =====

// Fonction pour obtenir la semaine courante
function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Archiver la semaine courante
app.post('/api/archive-week', authenticate, checkPermission('create'), async (req, res) => {
  try {
    const currentWeekNum = getCurrentWeek();
    
    // Les données sont déjà archivées automatiquement par la colonne 'week'
    // Juste retourner un succès
    res.json({ 
      message: 'Semaine archivée avec succès',
      week: currentWeekNum
    });
    
  } catch (err) {
    console.error('Erreur archive week:', err);
    res.status(500).json({ error: 'Erreur lors de l\'archivage' });
  }
});

// Route pour servir le frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📱 Frontend disponible sur http://localhost:${PORT}`);
  console.log(`🔌 API disponible sur http://localhost:${PORT}/api`);
});

module.exports = app;
