// Déploiement par versions (releases) + lien « current », sauvegarde obligatoire, migrations volontaires, retour arrière.
// Le script est exercé en mode « local » (la cible est un dossier) : même logique qu'avec l'hébergement OVH en SSH.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const MY = require('./mysql').args;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync, spawn } = require('child_process');

const RACINE = path.join(__dirname, '..');
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opt });
let tmp, base, nomBase, data, src2, envFile;
const sql = q => sh('mysql', [...MY, '-N', nomBase, '-e', q]).stdout.trim();
const lien = () => fs.readlinkSync(path.join(base, 'current')).replace(/^releases\//, '');
const releases = () => fs.readdirSync(path.join(base, 'releases')).filter(f => /^20/.test(f)).sort();
const ecrireConfig = (extra = {}) => fs.writeFileSync(path.join(base, 'config', 'config.php'),
  `<?php return ${JSON.stringify({ db_host: '127.0.0.1', db_name: nomBase, db_user: process.env.LR_DB_USER || 'root', db_pass: process.env.LR_DB_PASS || '', data_dir: data, env: 'test', ...extra }).replace(/^\{/, '[').replace(/\}$/, ']').replace(/"([a-z_]+)":/g, "'$1'=>")};\n`);
const deployer = (args = [], env = {}) => sh('bash', [path.join(RACINE, 'deploiement', 'deployer.sh'), '--cible=test', '--sans-verification-web', ...args], { env: { ...process.env, DEPLOY_ENV_FILE: envFile, ...env } });
const retour = (args = []) => sh('bash', [path.join(RACINE, 'deploiement', 'retour-arriere.sh'), '--cible=test', ...args], { env: { ...process.env, DEPLOY_ENV_FILE: envFile } });
const php = (script, args = []) => sh('php', [path.join(base, 'current', 'outils', script), ...args]);

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-dep-'));
  base = path.join(tmp, 'projets'); data = path.join(base, 'data'); fs.mkdirSync(path.join(base, 'config'), { recursive: true });
  nomBase = `lr_t_dep_${process.pid}`;
  sh('php', [path.join(RACINE, 'outils', 'test-base.php'), 'create', nomBase]);
  envFile = path.join(tmp, 'cible.env'); fs.writeFileSync(envFile, `MODE=local\nREMOTE_BASE="${base}"\n`);
  ecrireConfig();
  // Base installée (migrations faites) avant le premier déploiement
  sh('php', [path.join(RACINE, 'outils', 'test-base.php'), 'admin'], { env: { ...process.env, LR_TESTING: '1', LR_DB_NAME: nomBase, LR_DATA_DIR: data } });
  // Copie du dépôt avec une version différente, pour le deuxième déploiement
  src2 = path.join(tmp, 'src2'); fs.mkdirSync(src2);
  sh('rsync', ['-a', '--exclude', 'node_modules', '--exclude', '.git', '--exclude', 'donnees', RACINE + '/', src2 + '/']);
  const rt = path.join(src2, 'www', 'api', 'routes.php');
  fs.writeFileSync(rt, fs.readFileSync(rt, 'utf8').replace(/APP_VERSION = '[^']*'/, "APP_VERSION = '9.9.9'"));
});
after(() => { sh('php', [path.join(RACINE, 'outils', 'test-base.php'), 'drop', nomBase]); fs.rmSync(tmp, { recursive: true, force: true }); });

test('premier déploiement : paquet vérifié, sauvegarde faite, version en service', () => {
  const r = deployer();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Syntaxe PHP : OK/);
  assert.match(r.stdout, /Sauvegarde vérifiée avant déploiement/);
  assert.match(r.stdout, /Déploiement terminé/);
  assert.equal(releases().length, 1);
  assert.equal(lien(), releases()[0]);
  const rel = JSON.parse(fs.readFileSync(path.join(base, 'current', 'RELEASE.json')));
  assert.equal(rel.cible, 'test');
  assert.ok(fs.readdirSync(path.join(data, 'sauvegardes')).some(f => /avant-deploiement.*manifest/.test(f)), 'sauvegarde avant déploiement');
});

test('le paquet ne contient ni secrets, ni tests, ni documents ; robots.txt seulement hors production', () => {
  const cur = path.join(base, 'current');
  assert.ok(!fs.existsSync(path.join(cur, 'www', 'config.php')));
  for (const interdit of ['tests', 'docs', 'serveur-interne', '.git', 'package.json', 'prototype.html']) assert.ok(!fs.existsSync(path.join(cur, interdit)), interdit);
  assert.ok(fs.existsSync(path.join(cur, 'www', '.htaccess')));
  assert.ok(fs.existsSync(path.join(cur, 'outils', 'sauvegarde.php')));
  assert.match(fs.readFileSync(path.join(cur, 'www', 'robots.txt'), 'utf8'), /Disallow: \//);
  assert.equal(fs.statSync(path.join(cur, 'www', 'index.html')).mode & 0o007, 0, 'rien de lisible par « les autres »');
  assert.equal(fs.statSync(base + '/config').mode & 0o007, 0);
});

test('la version déployée retrouve la configuration et les données hors du code', () => {
  const r = php('migrer.php');
  assert.match(r.stdout, /état : ok/);
  assert.equal(path.dirname(fs.realpathSync(path.join(base, 'current', 'www', 'api'))).includes(base), true);
});

test('deuxième déploiement : la nouvelle version est en service, l\'ancienne reste disponible', () => {
  const avant = lien();
  const r = deployer(['--source=' + src2]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(releases().length, 2);
  assert.notEqual(lien(), avant);
  assert.match(fs.readFileSync(path.join(base, 'current', 'www', 'api', 'routes.php'), 'utf8'), /APP_VERSION = '9\.9\.9'/);
});

test('retour arrière : l\'ancienne version est remise en service, la base n\'est pas touchée', () => {
  const avantBase = sql('SELECT COUNT(*) FROM users');
  const r = retour();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(base, 'current', 'www', 'api', 'routes.php'), 'utf8'), /APP_VERSION = '3\.0\.0'/);
  assert.equal(sql('SELECT COUNT(*) FROM users'), avantBase);
  const ver = releases();
  const vers = retour(['--vers=' + ver[1]]);
  assert.equal(vers.status, 0, vers.stderr);
  assert.equal(lien(), ver[1]);
});

test('migration en attente : jamais appliquée sans --migrer ; avec --migrer : sauvegarde puis mise à jour', () => {
  sh('mysql', [...MY, nomBase, '-e', "UPDATE settings SET v = '1' WHERE k = 'schema_version'"]);
  const sans = deployer(['--source=' + src2]);
  assert.equal(sans.status, 0, sans.stdout + sans.stderr);
  assert.match(sans.stdout, /La base doit être mise à jour/);
  assert.equal(sql("SELECT v FROM settings WHERE k = 'schema_version'"), '1', 'base intacte');
  const avec = deployer(['--source=' + src2, '--migrer']);
  assert.equal(avec.status, 0, avec.stdout + avec.stderr);
  assert.match(avec.stdout, /Mise à jour de la base/);
  assert.equal(sql("SELECT v FROM settings WHERE k = 'schema_version'"), '4');
  assert.ok(fs.readdirSync(path.join(data, 'sauvegardes')).some(f => /avant-migration.*manifest/.test(f)));
});

test('sauvegarde impossible : déploiement annulé, version en service inchangée, dossier neuf supprimé', () => {
  const avant = lien(), n = releases().length;
  ecrireConfig({ data_dir: '/dev/null/impossible' });
  const r = deployer(['--source=' + src2]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ÉCHEC DE LA SAUVEGARDE : déploiement annulé/);
  assert.equal(lien(), avant);
  assert.equal(releases().length, n);
  ecrireConfig();
});

test('code invalide : refusé avant tout envoi', () => {
  const mauvais = path.join(tmp, 'mauvais'); fs.mkdirSync(mauvais);
  sh('rsync', ['-a', '--exclude', 'node_modules', '--exclude', '.git', src2 + '/', mauvais + '/']);
  fs.appendFileSync(path.join(mauvais, 'www', 'api', 'lib.php'), '\nfunction casse( {\n');
  const avant = lien(), n = releases().length;
  const r = deployer(['--source=' + mauvais]);
  assert.notEqual(r.status, 0);
  assert.equal(lien(), avant); assert.equal(releases().length, n);
});

test('retour arrière refusé si la base a reçu une migration que l\'ancien code ne comprend pas', () => {
  // Simule une version future dont la migration n° 5 est « cassante » : les versions de code qui ne la connaissent pas ne peuvent plus servir la base.
  sh('mysql', [...MY, nomBase, '-e', "UPDATE settings SET v = '5' WHERE k = 'schema_version'; INSERT INTO settings (k, v) VALUES ('schema_min_code', '5') ON DUPLICATE KEY UPDATE v = '5'"]);
  const avant = lien();
  const r = retour();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /REFUS/);
  assert.equal(lien(), avant);
  assert.equal(retour(['--forcer']).status, 0, 'avec --forcer (en connaissance de cause)');
  sh('mysql', [...MY, nomBase, '-e', "DELETE FROM settings WHERE k = 'schema_min_code'; UPDATE settings SET v = '4' WHERE k = 'schema_version'"]);
});

test('test d\'accès après bascule : en cas d\'échec, retour automatique à la version précédente', async () => {
  const srv = http.createServer((req, res) => { res.statusCode = 500; res.end('{"error":"cassé"}'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const avant = lien();
  const r = await new Promise(res => {
    const p = spawn('bash', [path.join(RACINE, 'deploiement', 'deployer.sh'), '--cible=test', '--source=' + src2], { env: { ...process.env, DEPLOY_ENV_FILE: envFile, SITE_URL: 'http://127.0.0.1:' + srv.address().port } });
    let o = '', e = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d); p.on('close', c => res({ status: c, stdout: o, stderr: e }));
  });
  srv.close();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /retour automatique à la version précédente/);
  assert.equal(lien(), avant, 'la version précédente est remise en service');
});

test('nettoyage : on ne garde que les N dernières versions, jamais celle en service', () => {
  for (let i = 0; i < 4; i++) deployer(['--source=' + src2, '--garder=3']);
  assert.ok(releases().length <= 3 + 1, 'au plus N versions (+ celle en service si plus ancienne)');
  assert.ok(releases().includes(lien()));
});
