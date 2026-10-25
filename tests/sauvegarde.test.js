// Sauvegardes : export en flux, vérification, chiffrement, restauration sur base isolée, migration protégée par une sauvegarde.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const MY = require('./mysql').args;
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { demarrer, equipe, tache, PW, ADMIN_PW } = require('./aide');

let srv, E, tmp, pub, priv, restoreDb;
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opt });
const sql = (db, q) => sh('mysql', [...MY, '-N', '--default-character-set=utf8mb4', db, '-e', q]).stdout.trim();
const fichiers = (dir, re) => fs.readdirSync(dir).filter(f => re.test(f)).sort();

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-bk-'));
  priv = path.join(tmp, 'prive.pem'); pub = path.join(tmp, 'public.pem');
  sh('openssl', ['genrsa', '-out', priv, '2048']);
  sh('openssl', ['rsa', '-in', priv, '-pubout', '-out', pub]);
  restoreDb = `lr_t_restore_${process.pid}`;
  sh('php', [path.join(__dirname, '..', 'outils', 'test-base.php'), 'create', restoreDb], { env: { ...process.env } });
  srv = await demarrer(); E = await equipe(srv);
  for (let i = 0; i < 3; i++) await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Tâche ' + i + ' « accentuée » \\ \' ; -- 🙂\nsur deux lignes' }));
});
after(async () => {
  await srv.stop();
  sh('php', [path.join(__dirname, '..', 'outils', 'test-base.php'), 'drop', restoreDb]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const envTest = (extra = {}) => ({ LR_TEST_RESTORE_DB: restoreDb, ...extra });
const dossierSauvegardes = () => path.join(srv.data, 'sauvegardes');

test('sauvegarde sans chiffrement : fichier vérifié, manifeste, droits restreints, statut', async () => {
  const r = srv.cli('sauvegarde.php', ['--raison=essai'], envTest());
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK projets-.*\.sql\.gz/);
  const f = fichiers(dossierSauvegardes(), /\.sql\.gz$/)[0];
  const man = JSON.parse(fs.readFileSync(path.join(dossierSauvegardes(), f.replace('.sql.gz', '.manifest.json'))));
  assert.equal(man.verified, true);
  assert.equal(man.encrypted, false);
  assert.equal(man.tables.tasks, 3);
  assert.ok(man.tables.users >= 3 && man.tables.audit_log > 0);
  assert.ok(!('sessions' in man.tables), 'sessions exclues');
  assert.equal(fs.statSync(path.join(dossierSauvegardes(), f)).mode & 0o077, 0, 'lisible par le propriétaire seulement');
  assert.equal(man.sha256, require('crypto').createHash('sha256').update(fs.readFileSync(path.join(dossierSauvegardes(), f))).digest('hex'));
  const st = (await E.admin.get('/api/securite')).data;
  assert.ok(st.sauvegarde.dernierOk);
  assert.equal(st.sauvegarde.chiffree, false);
  assert.ok(st.alertes.some(a => /chiffrées/.test(a.texte)), 'alerte : non chiffrée');
});

test('restauration sur la base d\'essai : mêmes lignes, caractères spéciaux intacts, production non touchée', async () => {
  const f = path.join(dossierSauvegardes(), fichiers(dossierSauvegardes(), /\.sql\.gz$/)[0]);
  const avant = sql(srv.nom, 'SELECT COUNT(*) FROM tasks');
  const r = srv.cli('restaurer.php', [f], envTest());
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Restauration d'essai réussie \(production non touchée\)/);
  assert.equal(sql(restoreDb, 'SELECT COUNT(*) FROM tasks'), '3');
  const empreinte = db => sql(db, "SELECT MD5(GROUP_CONCAT(CONCAT(id, title, description) ORDER BY id SEPARATOR '|')) FROM tasks");
  assert.equal(empreinte(restoreDb), empreinte(srv.nom), 'titres accentués, guillemets, antislash, retours à la ligne, émojis : identiques');
  assert.match(sql(restoreDb, "SELECT title FROM tasks LIMIT 1"), /« accentuée »/);
  assert.equal(sql(srv.nom, 'SELECT COUNT(*) FROM tasks'), avant);
});

test('restauration : refusée sur la production par défaut, refusée si la base d\'essai EST la production', async () => {
  const f = path.join(dossierSauvegardes(), fichiers(dossierSauvegardes(), /\.sql\.gz$/)[0]);
  assert.match(srv.cli('restaurer.php', [f, '--cible=production']).stderr, /confirmer=/);
  assert.match(srv.cli('restaurer.php', [f]).stderr, /Aucune base d'essai/);
  const memeBase = srv.cli('restaurer.php', [f], { LR_TEST_RESTORE_DB: srv.nom });
  assert.notEqual(memeBase.status, 0);
  assert.match(memeBase.stderr, /production : refusé/);
});

test('fichier tronqué ou modifié : la restauration échoue clairement', async () => {
  const f = path.join(dossierSauvegardes(), fichiers(dossierSauvegardes(), /\.sql\.gz$/)[0]);
  const complet = zlib.gunzipSync(fs.readFileSync(f));
  const coupe = path.join(tmp, 'coupe.sql.gz');
  fs.writeFileSync(coupe, zlib.gzipSync(complet.subarray(0, Math.floor(complet.length * 0.6))));
  const r = srv.cli('restaurer.php', [coupe], envTest());
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ÉCHEC|tronqué|CONTRÔLE/);
});

test('sauvegarde chiffrée : seul le détenteur de la clé privée la lit ; intégrité contrôlée', async () => {
  // Nouveau serveur avec la clé publique configurée
  const s2 = await demarrer({ backupPubKey: pub });
  try {
    const E2 = await equipe(s2);
    await E2.antoine.post('/api/tasks', tache(E2.ids.g, { title: 'Secrète' }));
    const r = s2.cli('sauvegarde.php');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const dir = path.join(s2.data, 'sauvegardes');
    const enc = fichiers(dir, /\.sql\.gz\.enc$/)[0];
    assert.ok(enc, 'fichier chiffré');
    assert.equal(fichiers(dir, /\.sql\.gz$/).length, 0, 'aucune copie en clair');
    const man = JSON.parse(fs.readFileSync(path.join(dir, enc.replace('.sql.gz.enc', '.manifest.json'))));
    assert.equal(man.encrypted, true);
    assert.ok(!fs.readFileSync(path.join(dir, enc)).includes('Secrète'), 'contenu illisible');
    // Déchiffrement avec les outils standard (comme le fera le serveur interne) : clé privée RSA → clé AES → clair
    const wrapped = path.join(tmp, 'k.bin'); fs.writeFileSync(wrapped, Buffer.from(man.encryption.key_wrapped, 'base64'));
    const k = sh('openssl', ['pkeyutl', '-decrypt', '-inkey', priv, '-in', wrapped, '-pkeyopt', 'rsa_padding_mode:oaep']);
    const cle = sh('openssl', ['pkeyutl', '-decrypt', '-inkey', priv, '-in', wrapped, '-pkeyopt', 'rsa_padding_mode:oaep'], { encoding: 'buffer' }).stdout;
    assert.equal(cle.length, 64);
    const clair = sh('openssl', ['enc', '-d', '-aes-256-cbc', '-K', cle.subarray(0, 32).toString('hex'), '-iv', man.encryption.iv, '-in', path.join(dir, enc)], { encoding: 'buffer' }).stdout;
    assert.match(zlib.gunzipSync(clair).toString(), /Secrète/);
    // HMAC
    const mac = require('crypto').createHmac('sha256', cle.subarray(32)).update(Buffer.from(man.encryption.iv, 'hex')).update(fs.readFileSync(path.join(dir, enc))).digest('hex');
    assert.equal(mac, man.encryption.hmac_sha256);
    // Restauration complète par l'outil de l'application, avec la clé privée
    const ok = s2.cli('restaurer.php', [path.join(dir, enc), '--cle-privee=' + priv], envTest());
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /Déchiffrement et contrôle d'intégrité : OK/);
    assert.equal(sql(restoreDb, "SELECT COUNT(*) FROM tasks WHERE title = 'Secrète'"), '1');
    // Fichier altéré : détecté avant toute restauration
    const abime = path.join(dir, enc); const buf = fs.readFileSync(abime); buf[100] ^= 0xff; fs.writeFileSync(abime, buf);
    const ko = s2.cli('restaurer.php', [abime, '--cle-privee=' + priv], envTest());
    assert.notEqual(ko.status, 0);
    assert.match(ko.stderr, /Intégrité/);
    const mauvaiseCle = path.join(tmp, 'autre.pem'); sh('openssl', ['genrsa', '-out', mauvaiseCle, '2048']);
    assert.match(s2.cli('restaurer.php', [path.join(dir, enc), '--cle-privee=' + mauvaiseCle], envTest()).stderr, /Clé privée refusée|Déchiffrement impossible/);
  } finally { await s2.stop(); }
});

test('sauvegarde de gros volumes en flux : mémoire plafonnée à 24 Mo', async () => {
  const id = E.ids.g;
  const t = (await E.antoine.state()).tasks[0].id;
  const chiffres = '(SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
  srv.sql(`INSERT INTO comments (id, task_id, user_id, body, created_at)
           SELECT CONCAT('c', LPAD(a.d + b.d * 10 + c.d * 100 + e.d * 1000 + f.d * 10000, 10, '0')), '${t}', NULL, REPEAT('x', 200), UTC_TIMESTAMP()
           FROM ${chiffres} a, ${chiffres} b, ${chiffres} c, ${chiffres} e, (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) f`);
  const r = srv.cli('sauvegarde.php', ['--raison=volume'], envTest());
  const r2 = require('child_process').spawnSync('php', ['-d', 'memory_limit=24M', path.join(__dirname, '..', 'outils', 'sauvegarde.php'), '--raison=volume'], { env: { ...process.env, ...srv.env }, encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  assert.match(r2.stdout, /4\d{4} lignes|[4-9]\d{4} lignes/);
  const dernier = fichiers(dossierSauvegardes(), /volume\.manifest\.json$/).pop();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dossierSauvegardes(), dernier))).tables.comments, 40000);
  srv.sql("DELETE FROM comments WHERE id LIKE 'c0%'");
});

test('rotation locale : on garde les N sauvegardes les plus récentes', async () => {
  for (let i = 0; i < 4; i++) srv.cli('sauvegarde.php', ['--garder=3', '--raison=rot' + i]);
  assert.ok(fichiers(dossierSauvegardes(), /\.manifest\.json$/).length <= 3);
});

test('échec de sauvegarde : code de sortie non nul, journal, statut, aucune sauvegarde fantôme', async () => {
  const r = srv.cli('sauvegarde.php', [], { LR_DATA_DIR: '/dev/null/impossible' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ECHEC/);
  // le dossier de données par défaut du test reste cohérent
  assert.ok(!fichiers(dossierSauvegardes(), /\.part$/).length);
});

/* ---------- Migrations volontaires ---------- */
test('base en retard : l\'application refuse de servir (503) et ne migre JAMAIS toute seule', async () => {
  const avant = sql(srv.nom, "SELECT v FROM settings WHERE k = 'schema_version'");
  srv.sql("UPDATE settings SET v = '1' WHERE k = 'schema_version'");
  const r = await srv.client().get('/api/comptes');
  assert.equal(r.status, 503);
  assert.equal(r.data.code, 'schema');
  assert.match(r.data.error, /mise à jour/i);
  assert.equal(sql(srv.nom, "SELECT v FROM settings WHERE k = 'schema_version'"), '1', 'la requête n\'a rien modifié');
  assert.equal((await srv.client().login('Claire', PW)).status, 503);
  const etat = srv.cli('migrer.php');
  assert.match(etat.stdout, /ancien/);
  assert.equal(sql(srv.nom, "SELECT v FROM settings WHERE k = 'schema_version'"), '1', 'sans --appliquer rien ne bouge');
  srv.sql(`UPDATE settings SET v = '${avant}' WHERE k = 'schema_version'`);
});

test('migration : sauvegarde vérifiée d\'abord, puis mise à jour, données intactes', async () => {
  const lignes = sql(srv.nom, 'SELECT COUNT(*) FROM tasks') + '/' + sql(srv.nom, 'SELECT COUNT(*) FROM users');
  srv.sql("UPDATE settings SET v = '1' WHERE k = 'schema_version'");
  const nb = fichiers(dossierSauvegardes(), /avant-migration.*\.manifest\.json$/).length;
  const r = srv.cli('migrer.php', ['--appliquer']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK : version 1 → \d+. Sauvegarde préalable : projets-.*avant-migration/);
  assert.equal(fichiers(dossierSauvegardes(), /avant-migration.*\.manifest\.json$/).length, nb + 1);
  assert.equal(sql(srv.nom, 'SELECT COUNT(*) FROM tasks') + '/' + sql(srv.nom, 'SELECT COUNT(*) FROM users'), lignes);
  assert.equal((await srv.client().login('Claire', PW)).status, 200);
  assert.ok((await E.admin.get('/api/audit?action=migration')).data.events.length >= 1);
});

test('si la sauvegarde échoue, la base n\'est PAS modifiée', async () => {
  srv.sql("UPDATE settings SET v = '1' WHERE k = 'schema_version'");
  const r = srv.cli('migrer.php', ['--appliquer'], { LR_DATA_DIR: '/dev/null/impossible' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Sauvegarde avant mise à jour impossible : la base n'a PAS été modifiée/);
  assert.equal(sql(srv.nom, "SELECT v FROM settings WHERE k = 'schema_version'"), '1');
  assert.equal(srv.cli('migrer.php', ['--appliquer']).status, 0);
});

test('retour arrière du code : une base plus récente reste utilisable si les migrations sont compatibles', async () => {
  const reel = sql(srv.nom, "SELECT v FROM settings WHERE k = 'schema_version'");
  srv.sql("UPDATE settings SET v = '99' WHERE k = 'schema_version'");
  assert.equal((await srv.client().get('/api/comptes')).status, 200, 'migrations « non cassantes » : l\'ancien code fonctionne');
  srv.sql("INSERT INTO settings (k, v) VALUES ('schema_min_code', '99') ON DUPLICATE KEY UPDATE v = '99'");
  assert.equal((await srv.client().get('/api/comptes')).status, 503, 'migration cassante : le code trop ancien refuse de démarrer');
  srv.sql("DELETE FROM settings WHERE k = 'schema_min_code'");
  srv.sql(`UPDATE settings SET v = '${reel}' WHERE k = 'schema_version'`);
});

test('restauration en production : exige la confirmation, sauvegarde l\'état actuel avant d\'écraser', async () => {
  const f = path.join(dossierSauvegardes(), fichiers(dossierSauvegardes(), /\.sql\.gz$/).pop());
  const avant = sql(srv.nom, 'SELECT COUNT(*) FROM tasks');
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Ajoutée après la sauvegarde' }));
  const r = srv.cli('restaurer.php', [f, '--cible=production', '--confirmer=' + srv.nom]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Sauvegarde de l'état actuel avant écrasement/);
  assert.match(r.stdout, /Production restaurée/);
  assert.ok(fichiers(dossierSauvegardes(), /avant-restauration/).length >= 1);
  assert.notEqual(sql(srv.nom, 'SELECT COUNT(*) FROM tasks'), String(Number(avant) + 1));
});
