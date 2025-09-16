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
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }

        /* Login Styles */
        .login-container {
            padding: 3rem;
            text-align: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

        .test-accounts {
            margin-top: 2rem;
            padding: 1rem;
            background: linear-gradient(135deg, #e6fffa 0%, #f0fff4 100%);
            border-radius: 8px;
            font-size: 0.9rem;
            color: #4a5568;
            border: 1px solid #81e6d9;
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

        /* Tabs Styles */
        .tabs {
            display: flex;
            background: #f8f9fa;
            border-bottom: 2px solid #dee2e6;
            overflow-x: auto;
        }

        .tab {
            padding: 15px 25px;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 16px;
            font-weight: 600;
            color: #6c757d;
            transition: all 0.3s ease;
            white-space: nowrap;
            border-bottom: 3px solid transparent;
        }

        .tab:hover {
            background: #e9ecef;
            color: #495057;
        }

        .tab.active {
            color: #007bff;
            border-bottom-color: #007bff;
            background: white;
        }

        .tab-content {
            display: none;
            padding: 30px;
            animation: fadeIn 0.5s ease;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Form Styles */
        .form-group {
            margin-bottom: 1.5rem;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
        }

        input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            font-size: 16px;
            transition: all 0.3s ease;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
        }

        .form-row {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .form-group {
            flex: 1;
            min-width: 200px;
        }

        /* Button Styles */
        .btn {
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,123,255,0.3);
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,123,255,0.4);
        }

        .btn-success {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            box-shadow: 0 4px 15px rgba(40,167,69,0.3);
        }

        .btn-danger {
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            box-shadow: 0 4px 15px rgba(220,53,69,0.3);
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            width: 100%;
        }

        .btn-secondary {
            background: #f7fafc;
            color: #4a5568;
            border: 2px solid #e2e8f0;
            box-shadow: none;
        }

        .btn-sm {
            padding: 8px 16px;
            font-size: 14px;
        }

        /* Section Styles */
        .section {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            border-left: 5px solid #007bff;
        }

        .section h2 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 1.8em;
            border-bottom: 2px solid #f1f3f4;
            padding-bottom: 10px;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 25px 0;
        }

        .stat-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            border-top: 4px solid;
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
        }

        .stat-card.revenue { border-top-color: #28a745; }
        .stat-card.expenses { border-top-color: #dc3545; }
        .stat-card.profit { border-top-color: #007bff; }
        .stat-card.cases { border-top-color: #ffc107; }

        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 10px;
        }

        .stat-label {
            color: #6c757d;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .revenue .stat-number { color: #28a745; }
        .expenses .stat-number { color: #dc3545; }
        .profit .stat-number { color: #007bff; }
        .cases .stat-number { color: #ffc107; }

        /* Table Styles */
        .table-container {
            overflow-x: auto;
            margin: 20px 0;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
        }

        th {
            background: linear-gradient(135deg, #495057 0%, #6c757d 100%);
            color: white;
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
            transition: background-color 0.3s ease;
        }

        tr:hover {
            background: #f8f9fa;
        }

        /* Employee Card Styles */
        .employee-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            border-left: 5px solid #007bff;
            transition: all 0.3s ease;
        }

        .employee-card:hover {
            transform: translateX(5px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }

        .employee-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .employee-name {
            font-size: 1.3em;
            font-weight: bold;
            color: #2c3e50;
        }

        .employee-role {
            color: #6c757d;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .employee-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }

        .employee-stat {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .employee-stat-value {
            font-size: 1.5em;
            font-weight: bold;
            color: #007bff;
        }

        .employee-stat-label {
            font-size: 0.8em;
            color: #6c757d;
            text-transform: uppercase;
        }

        .status-actif { color: #28a745; font-weight: bold; }
        .status-inactif { color: #dc3545; font-weight: bold; }

        /* Week Selector */
        .week-selector {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 25px;
            text-align: center;
        }

        .current-week {
            font-size: 1.5em;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 15px;
        }

        /* Error/Success Messages */
        .error {
            background: linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%);
            color: #c53030;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border-left: 4px solid #e53e3e;
        }

        .success {
            background: linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%);
            color: #2f855a;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border-left: 4px solid #38a169;
        }

        .loading {
            background: linear-gradient(135deg, #bee3f8 0%, #90cdf4 100%);
            color: #2b6cb0;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border-left: 4px solid #3182ce;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .header h1 { font-size: 2em; }
            .header p { font-size: 1em; }
            .tabs { flex-direction: column; }
            .form-row { flex-direction: column; }
            .stats-grid { grid-template-columns: 1fr; }
            .employee-stats { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <!-- Login Screen -->
    <div class="login-container" id="loginContainer">
        <div class="login-box">
            <div class="logo">
                <h1>Cabinet d'Avocats</h1>
                <p>Connexion au système GTA5 RP</p>
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

    <!-- Main Dashboard -->
    <div class="container dashboard" id="dashboard">
        <div class="header">
            <h1>⚖️ Cabinet d'Avocats</h1>
            <p>Système de Comptabilité - GTA5 RP</p>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="openTab(event, 'tableau-bord')">📊 Tableau de Bord</button>
            <button class="tab" onclick="openTab(event, 'employes')">👥 Employés</button>
            <button class="tab" onclick="openTab(event, 'semaine-courante')">📅 Semaine Courante</button>
            <button class="tab" onclick="openTab(event, 'historique')">📈 Historique</button>
            <button class="tab" onclick="openTab(event, 'services')">💼 Services</button>
            <button class="tab" onclick="openTab(event, 'finances')">💰 Finances</button>
            <button class="tab" onclick="logout()">🚪 Déconnexion</button>
        </div>

        <!-- Tableau de Bord -->
        <div id="tableau-bord" class="tab-content active">
            <div class="week-selector">
                <div class="current-week" id="currentWeek">Semaine du 15 septembre au 21 septembre 2025</div>
                <button class="btn" onclick="nouveleSemaine()">🔄 Nouvelle Semaine</button>
            </div>

            <div class="stats-grid">
                <div class="stat-card revenue">
                    <div class="stat-number" id="totalRevenue">8000€</div>
                    <div class="stat-label">Revenus Total</div>
                </div>
                <div class="stat-card expenses">
                    <div class="stat-number" id="totalExpenses">550€</div>
                    <div class="stat-label">Frais Total</div>
                </div>
                <div class="stat-card profit">
                    <div class="stat-number" id="totalProfit">7450€</div>
                    <div class="stat-label">Bénéfice Net</div>
                </div>
                <div class="stat-card cases">
                    <div class="stat-number" id="totalCases">2</div>
                    <div class="stat-label">Affaires Traitées</div>
                </div>
            </div>

            <div class="section">
                <h2>📊 Aperçu Rapide</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Métrique</th>
                                <th>Cette Semaine</th>
                                <th>Semaine Précédente</th>
                                <th>Évolution</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Revenus</td>
                                <td>25,000€</td>
                                <td>22,000€</td>
                                <td style="color: #28a745;">+13.6%</td>
                            </tr>
                            <tr>
                                <td>Nombre d'affaires</td>
                                <td>6</td>
                                <td>5</td>
                                <td style="color: #28a745;">+20%</td>
                            </tr>
                            <tr>
                                <td>Employés actifs</td>
                                <td>8</td>
                                <td>7</td>
                                <td style="color: #28a745;">+14.3%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Employés -->
        <div id="employes" class="tab-content">
            <div class="section">
                <h2>👤 Ajouter un Employé</h2>
                <div class="form-row">
                    <div class="form-group">
                        <label>Nom Complet</label>
                        <input type="text" id="employeeName" placeholder="Jean Dupont">
                    </div>
                    <div class="form-group">
                        <label>Poste</label>
                        <select id="employeeRole">
                            <option value="Associé Senior">Associé Senior</option>
                            <option value="Avocat">Avocat</option>
                            <option value="Avocat Junior">Avocat Junior</option>
                            <option value="Stagiaire">Stagiaire</option>
                            <option value="Secrétaire">Secrétaire</option>
                            <option value="Comptable">Comptable</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Salaire de Base (€)</label>
                        <input type="number" id="employeeSalary" placeholder="5000">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Taux de Commission (%)</label>
                        <input type="number" id="employeeCommission" placeholder="15">
                    </div>
                    <div class="form-group">
                        <label>Date d'Embauche</label>
                        <input type="date" id="employeeDate">
                    </div>
                    <div class="form-group">
                        <label>Statut</label>
                        <select id="employeeStatus">
                            <option value="Actif">Actif</option>
                            <option value="Inactif">Inactif</option>
                            <option value="Congé">Congé</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-success" onclick="ajouterEmploye()">➕ Ajouter Employé</button>
            </div>

            <div class="section">
                <h2>👥 Liste des Employés</h2>
                <div id="employeesList">
                    <!-- Les employés seront ajoutés ici dynamiquement -->
                </div>
            </div>
        </div>

        <!-- Semaine Courante -->
        <div id="semaine-courante" class="tab-content">
            <div class="section">
                <h2>💼 Nouvelle Affaire</h2>
                <div class="form-row">
                    <div class="form-group">
                        <label>Client</label>
                        <input type="text" id="clientName" placeholder="Nom du client">
                    </div>
                    <div class="form-group">
                        <label>Type d'Affaire</label>
                        <select id="caseType">
                            <option value="Pénal">Pénal</option>
                            <option value="Civil">Civil</option>
                            <option value="Commercial">Commercial</option>
                            <option value="Divorce">Divorce</option>
                            <option value="Immobilier">Immobilier</option>
                            <option value="Contrat">Contrat</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Avocat Assigné</label>
                        <select id="assignedLawyer">
                            <option value="">Sélectionner un avocat</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Honoraires (€)</label>
                        <input type="number" id="caseHonoraires" placeholder="2500">
                    </div>
                    <div class="form-group">
                        <label>Frais Additionnels (€)</label>
                        <input type="number" id="caseFrais" placeholder="150">
                    </div>
                    <div class="form-group">
                        <label>Statut</label>
                        <select id="caseStatus">
                            <option value="En cours">En cours</option>
                            <option value="Terminé">Terminé</option>
                            <option value="En attente">En attente</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="caseDescription" rows="3" placeholder="Détails de l'affaire..."></textarea>
                    </div>
                </div>
                <button class="btn btn-success" onclick="ajouterAffaire()">➕ Ajouter Affaire</button>
            </div>

            <div class="section">
                <h2>📋 Affaires de la Semaine</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Client</th>
                                <th>Type</th>
                                <th>Avocat</th>
                                <th>Honoraires</th>
                                <th>Frais</th>
                                <th>Statut</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="currentWeekCases">
                            <tr>
                                <td>Jean Dupont</td>
                                <td>Divorce</td>
                                <td>Marie Dubois</td>
                                <td>3000€</td>
                                <td>200€</td>
                                <td>Terminé</td>
                                <td><button class="btn btn-danger btn-sm">🗑️</button></td>
                            </tr>
                            <tr>
                                <td>SAS Technologies</td>
                                <td>Commercial</td>
                                <td>Pierre Martin</td>
                                <td>5000€</td>
                                <td>350€</td>
                                <td>En cours</td>
                                <td><button class="btn btn-danger btn-sm">🗑️</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Historique -->
        <div id="historique" class="tab-content">
            <div class="section">
                <h2>📊 Historique des Semaines</h2>
                <div class="form-row">
                    <div class="form-group">
                        <label>Sélectionner une Semaine</label>
                        <select id="weekSelector">
                            <option value="2025-W37">Semaine 37 (9-15 Sept 2025)</option>
                            <option value="2025-W36">Semaine 36 (2-8 Sept 2025)</option>
                            <option value="2025-W35">Semaine 35 (26 Août - 1 Sept 2025)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <button class="btn" onclick="chargerSemaine()">📊 Charger Données</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Services -->
        <div id="services" class="tab-content">
            <div class="section">
                <h2>💼 Tarifs des Services</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Type de Service</th>
                                <th>Tarif Horaire</th>
                                <th>Forfait</th>
                                <th>Commission Avocat</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Consultation</td>
                                <td>150€/h</td>
                                <td>-</td>
                                <td>20%</td>
                                <td><button class="btn">Modifier</button></td>
                            </tr>
                            <tr>
                                <td>Affaire Pénale</td>
                                <td>250€/h</td>
                                <td>3000€</td>
                                <td>25%</td>
                                <td><button class="btn">Modifier</button></td>
                            </tr>
                            <tr>
                                <td>Divorce</td>
                                <td>200€/h</td>
                                <td>2500€</td>
                                <td>20%</td>
                                <td><button class="btn">Modifier</button></td>
                            </tr>
                            <tr>
                                <td>Commercial</td>
                                <td>300€/h</td>
                                <td>5000€</td>
                                <td>30%</td>
                                <td><button class="btn">Modifier</button></td>
                            </tr>
                            <tr>
                                <td>Immobilier</td>
                                <td>180€/h</td>
                                <td>1500€</td>
                                <td>18%</td>
                                <td><button class="btn">Modifier</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Finances -->
        <div id="finances" class="tab-content">
            <div class="section">
                <h2>💰 Calcul des Salaires</h2>
                <div class="form-row">
                    <div class="form-group">
                        <button class="btn btn-success" onclick="calculerSalaires()">🧮 Calculer Salaires & Primes</button>
                    </div>
                    <div class="form-group">
                        <button class="btn" onclick="exporterDonnees()">📄 Exporter Données</button>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>📈 Rapport Financier</h2>
                <div class="stats-grid">
                    <div class="stat-card revenue">
                        <div class="stat-number">125,000€</div>
                        <div class="stat-label">CA Total</div>
                    </div>
                    <div class="stat-card expenses">
                        <div class="stat-number">65,000€</div>
                        <div class="stat-label">Salaires & Charges</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" style="color: #6f42c1;">15,000€</div>
                        <div class="stat-label">Frais Généraux</div>
                    </div>
                    <div class="stat-card profit">
                        <div class="stat-number">45,000€</div>
                        <div class="stat-label">Bénéfice Net</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = localStorage.getItem('authToken');
        let currentUser = null;
        let employees = [];
        let currentWeekCases = [];
        let currentWeek = '2025-W37';

        // Données d'exemple
        const sampleEmployees = [
            {
                id: 1,
                name: "Marie Dubois",
                role: "Associé Senior",
                salary: 8000,
                commission: 30,
                date: "2023-01-15",
                status: "Actif"
            },
            {
                id: 2,
                name: "Pierre Martin",
                role: "Avocat",
                salary: 5500,
                commission: 25,
                date: "2023-03-20",
                status: "Actif"
            },
            {
                id: 3,
                name: "Sophie Leroy",
                role: "Avocat Junior",
                salary: 3500,
                commission: 20,
                date: "2024-01-10",
                status: "Actif"
            }
        ];

        const sampleCases = [
            {
                id: 1,
                client: "Jean Dupont",
                type: "Divorce",
                lawyer: "Marie Dubois",
                honoraires: 3000,
                frais: 200,
                status: "Terminé",
                description: "Divorce contentieux"
            },
            {
                id: 2,
                client: "SAS Technologies",
                type: "Commercial",
                lawyer: "Pierre Martin",
                honoraires: 5000,
                frais: 350,
                status: "En cours",
                description: "Litige contractuel"
            }
        ];

        // Vérifier si l'utilisateur est déjà connecté
        if (authToken) {
            currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            showDashboard();
            loadAllData();
        }

        // Fonction pour afficher les messages
        function showMessage(message, type = 'error') {
            const messageDiv = document.getElementById('loginMessage');
            if (messageDiv) {
                messageDiv.innerHTML = `<div class="${type}">${message}</div>`;
                setTimeout(() => messageDiv.innerHTML = '', 5000);
            }
        }

        // Gestionnaire de connexion
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
                    showMessage('Connexion réussie !', 'success');
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

        // Afficher le dashboard
        function showDashboard() {
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
        }

        // Initialisation
        function loadAllData() {
            employees = [...sampleEmployees];
            currentWeekCases = [...sampleCases];
            updateEmployesList();
            updateCurrentWeekCases();
            updateLawyerSelect();
            updateCurrentWeekDisplay();
            updateDashboardStats();
        }

        function openTab(evt, tabName) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tab-content");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].classList.remove("active");
            }
            tablinks = document.getElementsByClassName("tab");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
            document.getElementById(tabName).classList.add("active");
            evt.currentTarget.classList.add("active");
        }

        function ajouterEmploye() {
            const name = document.getElementById('employeeName').value;
            const role = document.getElementById('employeeRole').value;
            const salary = parseInt(document.getElementById('employeeSalary').value);
            const commission = parseInt(document.getElementById('employeeCommission').value);
            const date = document.getElementById('employeeDate').value;
            const status = document.getElementById('employeeStatus').value;

            if (name && salary && commission) {
                employees.push({
                    id: Date.now(),
                    name: name,
                    role: role,
                    salary: salary,
                    commission: commission,
                    date: date,
                    status: status
                });
                
                updateEmployesList();
                updateLawyerSelect();
                
                // Reset form
                document.getElementById('employeeName').value = '';
                document.getElementById('employeeSalary').value = '';
                document.getElementById('employeeCommission').value = '';
                document.getElementById('employeeDate').value = '';
                
                alert('Employé ajouté avec succès !');
            } else {
                alert('Veuillez remplir tous les champs obligatoires.');
            }
        }

        function updateEmployesList() {
            const container = document.getElementById('employeesList');
            container.innerHTML = '';
            
            employees.forEach((emp, index) => {
                const card = document.createElement('div');
                card.className = 'employee-card';
                card.innerHTML = `
                    <div class="employee-header">
                        <div>
                            <div class="employee-name">${emp.name}</div>
                            <div class="employee-role">${emp.role}</div>
                        </div>
                        <div class="status-${emp.status.toLowerCase()}">${emp.status}</div>
                    </div>
                    <div class="employee-stats">
                        <div class="employee-stat">
                            <div class="employee-stat-value">${emp.salary}€</div>
                            <div class="employee-stat-label">Salaire Base</div>
                        </div>
                        <div class="employee-stat">
                            <div class="employee-stat-value">${emp.commission}%</div>
                            <div class="employee-stat-label">Commission</div>
                        </div>
                        <div class="employee-stat">
                            <div class="employee-stat-value">${new Date(emp.date).toLocaleDateString('fr-FR')}</div>
                            <div class="employee-stat-label">Date Embauche</div>
                        </div>
                        <div class="employee-stat">
                            <button class="btn btn-danger btn-sm" onclick="supprimerEmploye(${index})">🗑️ Supprimer</button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function supprimerEmploye(index) {
            if (confirm('Êtes-vous sûr de vouloir supprimer cet employé ?')) {
                employees.splice(index, 1);
                updateEmployesList();
                updateLawyerSelect();
            }
        }

        function updateLawyerSelect() {
            const select = document.getElementById('assignedLawyer');
            select.innerHTML = '<option value="">Sélectionner un avocat</option>';
            
            employees.filter(emp => 
                emp.role.includes('Avocat') || emp.role.includes('Associé')
            ).forEach(lawyer => {
                const option = document.createElement('option');
                option.value = lawyer.name;
                option.textContent = lawyer.name;
                select.appendChild(option);
            });
        }

        function ajouterAffaire() {
            const client = document.getElementById('clientName').value;
            const type = document.getElementById('caseType').value;
            const lawyer = document.getElementById('assignedLawyer').value;
            const honoraires = parseInt(document.getElementById('caseHonoraires').value);
            const frais = parseInt(document.getElementById('caseFrais').value) || 0;
            const status = document.getElementById('caseStatus').value;
            const description = document.getElementById('caseDescription').value;

            if (client && lawyer && honoraires) {
                currentWeekCases.push({
                    id: Date.now(),
                    client: client,
                    type: type,
                    lawyer: lawyer,
                    honoraires: honoraires,
                    frais: frais,
                    status: status,
                    description: description
                });
                
                updateCurrentWeekCases();
                updateDashboardStats();
                
                // Reset form
                document.getElementById('clientName').value = '';
                document.getElementById('caseHonoraires').value = '';
                document.getElementById('caseFrais').value = '';
                document.getElementById('caseDescription').value = '';
                
                alert('Affaire ajoutée avec succès !');
            } else {
                alert('Veuillez remplir tous les champs obligatoires.');
            }
        }

        function updateCurrentWeekCases() {
            const tbody = document.getElementById('currentWeekCases');
            tbody.innerHTML = '';
            
            currentWeekCases.forEach((cas, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${cas.client}</td>
                    <td>${cas.type}</td>
                    <td>${cas.lawyer}</td>
                    <td>${cas.honoraires.toLocaleString('fr-FR')}€</td>
                    <td>${cas.frais.toLocaleString('fr-FR')}€</td>
                    <td><span class="status-${cas.status.replace(' ', '-').toLowerCase()}">${cas.status}</span></td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="supprimerAffaire(${index})">🗑️</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        function supprimerAffaire(index) {
            if (confirm('Êtes-vous sûr de vouloir supprimer cette affaire ?')) {
                currentWeekCases.splice(index, 1);
                updateCurrentWeekCases();
                updateDashboardStats();
            }
        }

        function updateDashboardStats() {
            const totalRevenue = currentWeekCases.reduce((sum, cas) => sum + cas.honoraires, 0);
            const totalExpenses = currentWeekCases.reduce((sum, cas) => sum + cas.frais, 0);
            const totalProfit = totalRevenue - totalExpenses;
            const totalCases = currentWeekCases.length;

            document.getElementById('totalRevenue').textContent = totalRevenue.toLocaleString('fr-FR') + '€';
            document.getElementById('totalExpenses').textContent = totalExpenses.toLocaleString('fr-FR') + '€';
            document.getElementById('totalProfit').textContent = totalProfit.toLocaleString('fr-FR') + '€';
            document.getElementById('totalCases').textContent = totalCases;
        }

        function nouveleSemaine() {
            if (confirm('Êtes-vous sûr de vouloir créer une nouvelle semaine ? Les données actuelles seront archivées.')) {
                // Archiver la semaine actuelle
                const currentWeekData = {
                    week: currentWeek,
                    cases: [...currentWeekCases],
                    revenue: currentWeekCases.reduce((sum, cas) => sum + cas.honoraires, 0),
                    expenses: currentWeekCases.reduce((sum, cas) => sum + cas.frais, 0)
                };
                
                localStorage.setItem(`week_${currentWeek}`, JSON.stringify(currentWeekData));
                
                // Nouvelle semaine
                const now = new Date();
                const weekNumber = getWeekNumber(now);
                currentWeek = `2025-W${weekNumber}`;
                currentWeekCases = [];
                
                updateCurrentWeekDisplay();
                updateCurrentWeekCases();
                updateDashboardStats();
                
                alert('Nouvelle semaine créée avec succès !');
            }
        }

        function getWeekNumber(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        }

        function updateCurrentWeekDisplay() {
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay() + 1);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            const formatDate = (date) => {
                return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
            };
            
            document.getElementById('currentWeek').textContent = 
                `Semaine du ${formatDate(startOfWeek)} au ${formatDate(endOfWeek)} ${now.getFullYear()}`;
        }

        function chargerSemaine() {
            const selectedWeek = document.getElementById('weekSelector').value;
            alert(`Chargement des données pour la ${selectedWeek}`);
        }

        function calculerSalaires() {
            alert('Calcul des salaires en cours...');
        }

        function exporterDonnees() {
            const data = {
                employees: employees,
                currentWeek: currentWeek,
                currentWeekCases: currentWeekCases,
                exportDate: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(data, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `comptabilite_avocat_${currentWeek}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        }

        function logout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            location.reload();
        }

        // Initialisation des données au démarrage
        setTimeout(() => {
            if (authToken) {
                updateDashboardStats();
            }
        }, 100);
    </script>
</body>
</html>
