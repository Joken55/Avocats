console.log('🚀 Démarrage de l\'application...');

// Timeout global pour éviter que le script reste bloqué
const GLOBAL_TIMEOUT = 30000; // 30 secondes max

setTimeout(() => {
  console.log('⏰ Timeout atteint - Démarrage forcé du serveur');
  process.exit(0);
}, GLOBAL_TIMEOUT);

async function startApp() {
  try {
    console.log('⏳ Attente des services (3s)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🔧 Tentative de setup...');
    
    // Setup avec timeout
    const setupPromise = new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const setupProcess = spawn('node', ['setup.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 20000 // 20 secondes max pour le setup
      });

      let setupOutput = '';
      
      setupProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`📝 Setup: ${output.trim()}`);
        setupOutput += output;
      });

      setupProcess.stderr.on('data', (data) => {
        console.log(`⚠️ Setup warning: ${data.toString().trim()}`);
      });

      setupProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('✅ Setup terminé avec succès');
          resolve(true);
        } else {
          console.log(`⚠️ Setup terminé avec code: ${code}`);
          resolve(false); // On continue même si setup échoue
        }
      });

      setupProcess.on('error', (error) => {
        console.log(`❌ Erreur setup: ${error.message}`);
        resolve(false); // On continue même si erreur
      });

      // Timeout pour le setup
      setTimeout(() => {
        console.log('⏰ Setup timeout - arrêt forcé');
        setupProcess.kill('SIGTERM');
        resolve(false);
      }, 18000);
    });

    // Attendre le setup (avec timeout)
    await setupPromise;

    console.log('🌐 Démarrage du serveur principal...');
    require('../server.js');

  } catch (error) {
    console.error('💥 Erreur lors du démarrage:', error.message);
    console.log('🔄 Démarrage forcé du serveur...');
    require('../server.js');
  }
}

// Gestion des signaux
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM reçu - arrêt');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT reçu - arrêt');
  process.exit(0);
});

startApp();
