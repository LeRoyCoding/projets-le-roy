// Démarre le serveur « Projets Le Roy » (npm start, ou npm run demo pour les données d'exemple).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { open, startDailyBackup, ROOT } = require('./db');
const { createApp } = require('./app');

const DEMO = process.argv.includes('--demo');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(ROOT, 'donnees');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, DEMO ? 'demo.sqlite' : 'projets.sqlite');
const BACKUP_DIR = path.join(ROOT, 'sauvegardes');

let db;
try { db = open(DB_FILE, { backupDir: DEMO ? null : BACKUP_DIR }); }
catch (e) { console.error('\n  Impossible d\'ouvrir la base de données : ' + e.message + '\n'); process.exit(1); }
if (DEMO) require('./demo').seed(db);
else startDailyBackup(db, BACKUP_DIR);

const app = createApp({ db, demo: DEMO, backupDir: BACKUP_DIR });

const localAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);

const server = app.listen(PORT, '0.0.0.0', () => {
  const pidFile = path.join(DATA_DIR, 'serveur.pid');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(pidFile, String(process.pid)); } catch { /* sans importance */ }
  process.on('exit', () => {
    try { fs.unlinkSync(pidFile); } catch { /* déjà supprimé */ }
    try { db.close(); } catch { /* déjà fermée */ }
  });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  console.log('');
  console.log('  ==============================================');
  console.log('   Projets Le Roy est démarré' + (DEMO ? ' (MODE DÉMO, données d\'exemple)' : ''));
  console.log('  ==============================================');
  console.log(`   Sur ce PC          : http://localhost:${PORT}`);
  for (const ip of localAddresses()) console.log(`   Pour les collègues : http://${ip}:${PORT}`);
  console.log('');
  console.log('   Laissez cette fenêtre ouverte (vous pouvez la réduire).');
  console.log(`   Base de données : ${DB_FILE}`);
  console.log('');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Le port ${PORT} est déjà utilisé : le serveur est sans doute déjà lancé.\n`);
  else console.error(e);
  process.exit(1);
});
