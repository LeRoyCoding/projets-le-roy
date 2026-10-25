// Serveur interne : récupération des sauvegardes chiffrées, vérification, rotation, alertes, test de restauration.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const MY = require('./mysql').args;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { demarrer, equipe, tache } = require('./aide');

const RACINE = path.join(__dirname, '..');
const SI = path.join(RACINE, 'serveur-interne');
let srv, E, tmp, priv, pub, source, dest, conf, recu = [], webhook, webhookUrl;
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opt });
const ecrireConf = (extra = {}) => {
  const c = { SOURCE_LOCAL: source, DEST_DIR: dest, MAX_AGE_HOURS: 30, ALERT_WEBHOOK: webhookUrl, RESTORE_TEST: 1, PRIVATE_KEY: priv, TEST_DB_HOST: '127.0.0.1', TEST_DB_USER: process.env.LR_DB_USER || 'root', TEST_DB_PASS: process.env.LR_DB_PASS || '', TEST_DB_PREFIX: 'lr_restore_', ...extra };
  fs.writeFileSync(conf, Object.entries(c).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n');
};
// Asynchrone : le serveur « webhook » du test tourne dans ce même processus et doit pouvoir répondre pendant l'exécution.
const lancer = () => new Promise(res => {
  const p = require('child_process').spawn('bash', [path.join(SI, 'recuperer-sauvegardes.sh'), conf]);
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', status => res({ status, stdout: out, stderr: err }));
});
const journal = () => fs.existsSync(path.join(dest, 'sauvegarde.log')) ? fs.readFileSync(path.join(dest, 'sauvegarde.log'), 'utf8') : '';

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-si-'));
  priv = path.join(tmp, 'prive.pem'); pub = path.join(tmp, 'public.pem');
  sh('openssl', ['genrsa', '-out', priv, '2048']); sh('openssl', ['rsa', '-in', priv, '-pubout', '-out', pub]);
  srv = await demarrer({ backupPubKey: pub }); E = await equipe(srv);
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Tâche à sauvegarder' }));
  source = path.join(srv.data, 'sauvegardes'); dest = path.join(tmp, 'interne'); conf = path.join(tmp, 'sauvegarde.conf');
  webhook = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { recu.push(JSON.parse(b)); res.end('ok'); }); });
  await new Promise(r => webhook.listen(0, '127.0.0.1', r));
  webhookUrl = 'http://127.0.0.1:' + webhook.address().port + '/hook';
});
after(async () => { webhook.close(); await srv.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('rotation 30 jours / 12 semaines / 12 mois : tests unitaires', () => {
  const r = sh('python3', ['-m', 'unittest', '-q'], { cwd: SI });
  assert.equal(r.status, 0, r.stderr);
});

test('récupération : fichier chiffré copié, empreinte vérifiée, source intacte, journal tenu', async () => {
  assert.equal(srv.cli('sauvegarde.php').status, 0);
  ecrireConf({ RESTORE_TEST: 0 });
  const r = await lancer();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const recus = fs.readdirSync(path.join(dest, 'quotidien'));
  assert.ok(recus.some(f => f.endsWith('.sql.gz.enc')) && recus.some(f => f.endsWith('.manifest.json')));
  assert.match(journal(), /Reçu et vérifié : projets-.*\.sql\.gz\.enc/);
  assert.ok(fs.readdirSync(source).some(f => f.endsWith('.sql.gz.enc')), 'rien n\'est effacé côté hébergement');
  assert.equal(fs.statSync(path.join(dest, 'quotidien', recus.find(f => f.endsWith('.enc')))).mode & 0o077, 0);
  assert.equal(recu.length, 0, 'aucune alerte dans le cas normal');
});

test('test de restauration automatique : base temporaire restaurée, comparée, puis supprimée', async () => {
  fs.writeFileSync(path.join(dest, '.tester'), '');
  ecrireConf();
  const r = await lancer();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(journal(), /Test de restauration OK : projets-.*\.enc — \d+ tables, \d+ lignes identiques/);
  const bases = sh('mysql', [...MY, '-N', '-e', "SHOW DATABASES LIKE 'lr_restore_%'"]).stdout.trim();
  assert.equal(bases, '', 'la base temporaire est supprimée');
  assert.equal(recu.length, 0);
});

test('fichier corrompu en route : écarté et signalé (e-mail/webhook), jamais rangé', async () => {
  srv.cli('sauvegarde.php', ['--raison=corrompue']);
  const enc = fs.readdirSync(source).filter(f => /corrompue.*\.enc$/.test(f))[0];
  const buf = fs.readFileSync(path.join(source, enc)); buf[50] ^= 0xff; fs.writeFileSync(path.join(source, enc), buf);
  ecrireConf({ RESTORE_TEST: 0 });
  await lancer();
  assert.ok(!fs.readdirSync(path.join(dest, 'quotidien')).some(f => /corrompue/.test(f)));
  assert.match(journal(), /ALERTE : Sauvegarde corrompue/);
  assert.ok(recu.some(m => /Sauvegarde corrompue/.test(m.text)), 'webhook prévenu');
  fs.rmSync(path.join(source, enc)); fs.rmSync(path.join(source, enc.replace('.sql.gz.enc', '.manifest.json')));
});

test('sauvegarde trop ancienne (tâche CRON OVH arrêtée) : alerte de fraîcheur', async () => {
  recu.length = 0;
  for (const f of fs.readdirSync(path.join(dest, 'quotidien')).filter(f => f.endsWith('.manifest.json'))) {
    const p = path.join(dest, 'quotidien', f); const m = JSON.parse(fs.readFileSync(p));
    m.created_at = '2026-10-20 03:00:00 UTC'; fs.writeFileSync(p, JSON.stringify(m));
  }
  ecrireConf({ RESTORE_TEST: 0, MAX_AGE_HOURS: 30 });
  await lancer();
  assert.match(journal(), /ALERTE : Sauvegarde trop ancienne/);
  assert.ok(recu.some(m => /trop ancienne/.test(m.text)));
});

test('source injoignable : alerte « récupération impossible »', async () => {
  recu.length = 0;
  ecrireConf({ RESTORE_TEST: 0, SOURCE_LOCAL: path.join(tmp, 'n-existe-pas') });
  await lancer();
  assert.ok(recu.some(m => /Récupération des sauvegardes impossible/.test(m.text)));
});

test('test de restauration : échoue clairement avec une mauvaise clé privée', () => {
  const autre = path.join(tmp, 'autre.pem'); sh('openssl', ['genrsa', '-out', autre, '2048']);
  const r = sh('python3', [path.join(SI, 'tester-restauration.py'), path.join(dest, 'quotidien')],
    { env: { ...process.env, PRIVATE_KEY: autre, TEST_DB_USER: process.env.LR_DB_USER || 'root', TEST_DB_PASS: process.env.LR_DB_PASS || '', TEST_DB_PREFIX: 'lr_restore_' } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Clé de session invalide|Commande en échec|Intégrité/);
});

test('rotation réelle : refuse de supprimer plus de la moitié d\'un coup', () => {
  const d = fs.mkdtempSync(path.join(tmp, 'rot-'));
  for (let i = 0; i < 10; i++) { const n = `projets-x${i}`; fs.writeFileSync(path.join(d, n + '.manifest.json'), JSON.stringify({ created_at: `2020-01-${String(i + 1).padStart(2, '0')} 03:00:00 UTC`, reason: 'quotidienne' })); }
  const r = sh('python3', [path.join(SI, 'retention.py'), d, '--appliquer', '--aujourdhui=2026-10-25']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /REFUS/);
  assert.equal(fs.readdirSync(d).length, 10);
});
