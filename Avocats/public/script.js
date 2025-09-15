let authToken = localStorage.getItem('authToken');
let currentUser = null;
let clients = [];
let dossiers = [];
let rendezVous = [];

// Verification de l'authentification au chargement
if (authToken) {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    showDashboard();
    loadAllData();
}

// Gestion des messages
function showMessage(message, type = 'error') {
    const messageDiv = document.getElementById('loginMessage');
    if (messageDiv) {
        messageDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
        setTimeout(() => messageDiv.innerHTML = '', 5000);
    }
}

// Connexion
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
        console.error('Erreur:', error);
    }
});

// Affichage du dashboard
function showDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('dashboard').classList.add('active');
}

// Navigation entre sections
function showSection(sectionName) {
    // Masquer toutes les sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Desactiver tous les liens
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Afficher la section selectionnee
    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');
    
    // Charger les donnees selon la section
    switch(sectionName) {
        case 'clients':
            loadClients();
            break;
        case 'dossiers':
            loadDossiers();
            break;
        case 'rendez-vous':
            loadRendezVous();
            break;
    }
}

// Chargement de toutes les donnees
async function loadAllData() {
    await Promise.all([
        loadClients(),
        loadDossiers(), 
        loadRendezVous()
    ]);
    updateStats();
}

// Mise a jour des statistiques
function updateStats() {
    document.getElementById('clientCount').textContent = clients.length;
    document.getElementById('dossierCount').textContent = dossiers.length;
    document.getElementById('rdvCount').textContent = rendezVous.length;
}

// Chargement des clients
async function loadClients() {
    try {
        const response = await fetch('/api/clients', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        
        if (response.ok) {
            clients = await response.json();
            displayClients();
            updateClientSelects();
        } else {
            console.error('Erreur chargement clients');
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Affichage des clients
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