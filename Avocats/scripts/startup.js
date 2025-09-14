const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Démarrage de l\'application...');

// Fonction pour attendre quelques secondes
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startApp() {
  try {
    // Attendre un peu pour que les services Railway soient prêts
    console.log('⏳ Attente de la disponibilité des services...');
    await wait(5000);

    // Exécuter le setup
    console.log('🔧 Exécution du setup...');
    const setupProcess = spawn('node', ['setup.js'], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    setupProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('✅ Setup terminé avec succès');
        // Démarrer le serveur principal
        console.log('🌐 Démarrage du serveur...');
        const serverProcess = spawn('node', ['server.js'], {
          cwd: process.cwd(),
          stdio: 'inherit'
        });

        // Transférer les signaux au processus serveur
        process.on('SIGTERM', () => {
          console.log('🛑 Arrêt en cours...');
          serverProcess.kill('SIGTERM');
        });

        process.on('SIGINT', () => {
          console.log('🛑 Interruption...');
          serverProcess.kill('SIGINT');
        });

        serverProcess.on('exit', (serverCode) => {
          process.exit(serverCode);
        });

      } else {
        console.error('❌ Échec du setup, code:', code);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('💥 Erreur lors du démarrage:', error.message);
    process.exit(1);
  }
}

startApp();