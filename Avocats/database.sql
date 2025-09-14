-- schema.sql - Structure de la base de données PostgreSQL

-- Table des employés
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
);

-- Table des affaires
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
);

-- Table des services
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    type VARCHAR(255) NOT NULL UNIQUE,
    tarif INTEGER NOT NULL,
    forfait VARCHAR(100),
    commission INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des utilisateurs (optionnel pour extension future)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    grade VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_cases_week ON cases(week);
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(lawyer);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

-- Données initiales pour les employés
INSERT INTO employees (name, role, salary, commission, hire_date, status) VALUES
('Marie Dubois', 'Associé Senior', 8000, 30, '2023-01-15', 'Actif'),
('Pierre Martin', 'Avocat', 5500, 25, '2023-03-20', 'Actif'),
('Sophie Leroy', 'Avocat Junior', 3500, 20, '2024-01-10', 'Actif'),
('Lucas Bernard', 'Stagiaire', 1800, 15, '2024-09-05', 'Actif'),
('Julie Moreau', 'Secrétaire', 2800, 10, '2024-06-12', 'Actif'),
('Thomas Rousseau', 'Comptable', 4200, 12, '2024-04-08', 'Actif')
ON CONFLICT (name) DO NOTHING;

-- Données initiales pour les services
INSERT INTO services (type, tarif, forfait, commission) VALUES
('Consultation', 150, '-', 20),
('Affaire Pénale', 250, '3000€', 25),
('Divorce', 200, '2500€', 20),
('Commercial', 300, '5000€', 30),
('Immobilier', 180, '1500€', 18),
('Contrat', 220, '2000€', 22),
('Civil', 200, '2200€', 20),
('Succession', 180, '1800€', 18),
('Travail', 190, '2100€', 19),
('Assurance', 170, '1600€', 17)
ON CONFLICT (type) DO NOTHING;

-- Fonction pour automatiquement mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour mettre à jour automatiquement updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Vues utiles pour les rapports

-- Vue des statistiques par semaine
CREATE OR REPLACE VIEW weekly_stats AS
SELECT 
    week,
    COUNT(*) as total_cases,
    SUM(honoraires) as total_revenue,
    SUM(frais) as total_expenses,
    SUM(honoraires) - SUM(frais) as profit,
    COUNT(CASE WHEN status = 'Terminé' THEN 1 END) as completed_cases,
    COUNT(CASE WHEN status = 'En cours' THEN 1 END) as ongoing_cases
FROM cases
GROUP BY week
ORDER BY week DESC;

-- Vue des performances par avocat
CREATE OR REPLACE VIEW lawyer_performance AS
SELECT 
    e.name,
    e.role,
    e.salary,
    e.commission,
    COUNT(c.id) as cases_handled,
    COALESCE(SUM(c.honoraires), 0) as revenue_generated,
    COALESCE(SUM(c.honoraires * e.commission / 100), 0) as total_commission
FROM employees e
LEFT JOIN cases c ON e.name = c.lawyer
WHERE e.status = 'Actif'
GROUP BY e.id, e.name, e.role, e.salary, e.commission
ORDER BY revenue_generated DESC;

-- Vue du tableau de bord
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM employees WHERE status = 'Actif') as active_employees,
    (SELECT COUNT(*) FROM cases WHERE week = TO_CHAR(CURRENT_DATE, 'YYYY-"W"WW')) as current_week_cases,
    (SELECT COALESCE(SUM(honoraires), 0) FROM cases WHERE week = TO_CHAR(CURRENT_DATE, 'YYYY-"W"WW')) as current_week_revenue,
    (SELECT COALESCE(SUM(frais), 0) FROM cases WHERE week = TO_CHAR(CURRENT_DATE, 'YYYY-"W"WW')) as current_week_expenses;

-- Commentaires sur les tables
COMMENT ON TABLE employees IS 'Table des employés du cabinet d''avocats';
COMMENT ON TABLE cases IS 'Table des affaires traitées par le cabinet';
COMMENT ON TABLE services IS 'Table des services proposés et leurs tarifs';
COMMENT ON TABLE users IS 'Table des utilisateurs pour l''authentification (optionnel)';

COMMENT ON COLUMN employees.commission IS 'Pourcentage de commission sur les affaires (0-100)';
COMMENT ON COLUMN cases.week IS 'Semaine au format YYYY-WXX (ex: 2025-W37)';
COMMENT ON COLUMN cases.honoraires IS 'Montant des honoraires en euros';
COMMENT ON COLUMN cases.frais IS 'Frais additionnels en euros';

-- Permissions (à adapter selon vos besoins)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cabinet_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cabinet_app;