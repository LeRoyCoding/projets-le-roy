// Ouvre un tunnel HTTPS sécurisé (Cloudflare) vers le connecteur ChatGPT, et affiche l'adresse à coller dans ChatGPT.
// Lancé par ouvrir-pour-chatgpt.bat. L'accès depuis Internet dure tant que la fenêtre reste ouverte.
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const PORT_APP = Number(process.env.PORT) || 3000;
const PORT_MCP = Number(process.env.MCP_PORT) || 3001;
const EXE = path.join(__dirname, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const URL_EXE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(q) {
  process.stdout.write(q + ' : ');
  const { value, done } = await lines.next();
  if (done) process.exit(1);
  return String(value).trim();
}
const stop = (msg) => { console.log('\n  ' + msg + '\n'); process.exit(1); };

function trouverCloudflared() {
  if (fs.existsSync(EXE)) return EXE;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

async function telecharger() {
  if (process.platform !== 'win32') stop('Installez « cloudflared » (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) puis relancez.');
  console.log('  Téléchargement de l\'outil de tunnel officiel de Cloudflare (une seule fois, environ 60 Mo)…');
  const res = await fetch(URL_EXE);
  if (!res.ok) stop('Téléchargement impossible (' + res.status + '). Vérifiez la connexion Internet.');
  fs.writeFileSync(EXE, Buffer.from(await res.arrayBuffer()));
  console.log('  Outil installé : ' + EXE + '\n');
  return EXE;
}

(async () => {
  console.log('\n  ===== Ouvrir Projets Le Roy à ChatGPT =====\n');

  // 1. Le connecteur doit être activé (page Compte de l'administrateur).
  const ok = await fetch(`http://127.0.0.1:${PORT_MCP}/`).then(r => r.ok, () => false);
  if (!ok) {
    const app = await fetch(`http://127.0.0.1:${PORT_APP}/api/comptes`).then(r => r.ok, () => false);
    if (!app) stop('L\'application ne tourne pas sur ce PC : lancez d\'abord demarrer-en-arriere-plan.bat.');
    stop('Le connecteur ChatGPT est désactivé. L\'administrateur doit l\'activer : application → Compte → « Connecteur ChatGPT » → Activer.');
  }

  // 2. La clé d'accès de la personne qui utilisera ChatGPT.
  console.log('  Dans l\'application : Compte → « Lier à Claude ou ChatGPT » → Créer une clé d\'accès, puis copiez-la.');
  let key = '';
  while (!/^lr_[0-9a-f]{64}$/.test(key)) {
    key = await ask('  Collez la clé (clic droit)');
    if (!/^lr_[0-9a-f]{64}$/.test(key)) { console.log('  Clé incomplète (elle commence par lr_ et fait 67 caractères).'); continue; }
    const r = await fetch(`http://127.0.0.1:${PORT_APP}/api/state`, { headers: { authorization: 'Bearer ' + key } }).catch(() => null);
    if (!r || !r.ok) { console.log('  Cette clé est refusée (supprimée ?). Créez-en une nouvelle.'); key = ''; continue; }
    const st = await r.json();
    console.log(`  Clé de ${(st.users.find(u => u.id === st.me) || {}).name}, ${st.tasks.length} tâche(s) visibles.\n`);
  }

  // 3. Le tunnel HTTPS vers le seul connecteur (pas vers l'application).
  const exe = trouverCloudflared() || await telecharger();
  console.log('  Ouverture du tunnel sécurisé…');
  const p = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT_MCP}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let affiche = false;
  const lire = d => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !affiche) {
      affiche = true;
      console.log('\n  ==============================================================');
      console.log('   Adresse à coller dans ChatGPT (champ « URL du serveur MCP ») :\n');
      console.log('   ' + m[0] + '/mcp/' + key);
      console.log('\n   Authentification : « Aucune » (la clé est déjà dans l\'adresse).');
      console.log('  ==============================================================');
      console.log('\n   Gardez cette fenêtre ouverte tant que vous utilisez ChatGPT.');
      console.log('   La fermer coupe l\'accès depuis Internet.');
      console.log('   Attention : l\'adresse change à chaque ouverture ; il faudra la remettre à jour dans ChatGPT.\n');
    }
  };
  p.stdout.on('data', lire); p.stderr.on('data', lire);
  p.on('exit', code => { console.log('\n  Tunnel fermé (' + code + ').'); process.exit(0); });
  setTimeout(() => { if (!affiche) console.log('  Le tunnel tarde à s\'ouvrir… Vérifiez la connexion Internet.'); }, 30000);
})();
