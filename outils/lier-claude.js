// Ajoute « Projets Le Roy » dans la configuration de Claude Desktop (Windows, Mac).
// Lancé par lier-a-claude.bat. Ne touche à rien d'autre dans la configuration.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(q, def = '') {
  process.stdout.write(def ? `${q} [${def}] : ` : `${q} : `);
  const { value, done } = await lines.next();
  if (done) { console.log('\n  Saisie interrompue.'); process.exit(1); }
  return String(value).trim() || def;
}

// Emplacements possibles du fichier de configuration de Claude Desktop.
function configFiles() {
  const out = [];
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    out.push(path.join(appdata, 'Claude', 'claude_desktop_config.json'));
    // Version installée depuis le Microsoft Store
    const pkgs = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
    try {
      for (const d of fs.readdirSync(pkgs)) if (/^(Anthropic)?Claude/i.test(d)) out.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    } catch { /* pas de dossier Packages */ }
  } else if (process.platform === 'darwin') {
    out.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else {
    out.push(path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'));
  }
  return out;
}

(async () => {
  console.log('\n  ===== Lier Projets Le Roy à Claude =====\n');
  console.log('  1. Dans l\'application Projets Le Roy : page Compte → « Lier à Claude » → « Créer une clé d\'accès ».');
  console.log('  2. Copiez la clé (elle commence par lr_) et collez-la ci-dessous (clic droit pour coller).\n');

  const url = (await ask('  Adresse de l\'application', process.env.PROJETS_URL || 'http://localhost:3000')).replace(/\/+$/, '');
  let key = '';
  while (!/^lr_[0-9a-f]{64}$/.test(key)) {
    key = await ask('  Clé d\'accès');
    if (!/^lr_[0-9a-f]{64}$/.test(key)) console.log('  Cette clé ne semble pas complète (elle commence par lr_ et fait 67 caractères). Réessayez.');
  }

  // Vérifie que la clé fonctionne avant d'écrire quoi que ce soit.
  try {
    const res = await fetch(url + '/api/state', { headers: { authorization: 'Bearer ' + key } });
    if (res.status === 401) throw new Error('la clé est refusée (supprimée ?)');
    if (!res.ok) throw new Error('réponse ' + res.status);
    const st = await res.json();
    const me = st.users.find(u => u.id === st.me);
    console.log(`\n  Connexion réussie : clé de ${me ? me.name : '?'}, ${st.tasks.length} tâche(s) visibles.`);
  } catch (e) {
    console.log(`\n  Impossible de joindre l'application à ${url} : ${e.message}.`);
    console.log('  Vérifiez l\'adresse (elle est affichée par demarrer-en-arriere-plan.bat) et que le PC serveur est allumé.');
    rl.close(); process.exitCode = 1; return;
  }

  const entry = {
    command: process.execPath,                                  // chemin complet de Node.js
    args: [path.join(__dirname, 'claude-mcp.js')],
    env: { PROJETS_URL: url, PROJETS_CLE: key }
  };

  const files = configFiles();
  const existing = files.filter(f => fs.existsSync(path.dirname(f)));
  const targets = existing.length ? existing : [files[0]];
  for (const file of targets) {
    let conf = {};
    if (fs.existsSync(file)) {
      try { conf = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); }
      catch {
        console.log(`\n  Le fichier ${file} est illisible : je n'y touche pas.`);
        console.log('  Ouvrez Claude → Paramètres → Développeur pour le corriger, puis relancez ce script.');
        continue;
      }
      fs.copyFileSync(file, file + '.avant-projets-le-roy');
    }
    conf.mcpServers = conf.mcpServers || {};
    conf.mcpServers['projets-le-roy'] = entry;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(conf, null, 2));
    console.log(`  Configuration enregistrée : ${file}`);
  }

  console.log('\n  ===== C\'est fait =====');
  console.log('  Quittez complètement Claude (clic droit sur son icône près de l\'horloge → Quitter), puis rouvrez-le.');
  console.log('  Essayez ensuite : « Quelles sont mes tâches en retard ? »\n');
  rl.close();
})();
