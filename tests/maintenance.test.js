// maintenance.php : mise à jour volontaire de la base (avec sauvegarde), sauvegarde manuelle, récupération d'un administrateur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, ADMIN_PW } = require('./aide');

const KEY = 'cle-de-maintenance-de-test-0123456789abcdef';
let srv, E;
before(async () => { srv = await demarrer({ maintenanceKey: KEY }); E = await equipe(srv); });
after(() => srv.stop());
const post = champs => fetch(srv.base + '/maintenance.php', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ cle: KEY, ...champs }) }).then(r => r.text());

test('verrouillée sans la clé (et la clé dans l\'adresse est ignorée)', async () => {
  const html = await (await fetch(srv.base + '/maintenance.php?cle=' + KEY)).text();
  assert.match(html, /Clé de maintenance/);
  assert.doesNotMatch(html, /Sauvegarder/);
});

test('base à jour : état affiché, sauvegarde manuelle vérifiée', async () => {
  const html = await post({});
  assert.match(html, /La base est à jour/);
  const s = await post({ action: 'sauvegarder' });
  assert.match(s, /Sauvegarde vérifiée : projets-.*\.sql\.gz/);
  assert.match(s, /non chiffrée/);
});

test('base en retard : bouton « Sauvegarder puis mettre à jour », jamais de migration silencieuse', async () => {
  srv.sql("UPDATE settings SET v = '1' WHERE k = 'schema_version'");
  assert.equal((await srv.client().get('/api/comptes')).status, 503);
  const avant = await post({});
  assert.match(avant, /en retard|mise à jour est nécessaire/);
  assert.match(avant, /Sauvegarder puis mettre à jour la base/);
  const apres = await post({ action: 'migrer' });
  assert.match(apres, /Base mise à jour : version 1 → \d+/);
  assert.match(apres, /avant-migration/);
  assert.equal((await srv.client().get('/api/comptes')).status, 200);
});

test('alertes de sécurité visibles par l\'administrateur (installer.php présent, pas de sauvegarde chiffrée…)', async () => {
  const a = (await E.admin.get('/api/securite')).data.alertes;
  assert.ok(a.some(x => x.niveau === 'critique' && /installer\.php/.test(x.texte)));
  assert.ok(a.some(x => /chiffrées/.test(x.texte)));
  assert.equal((await E.antoine.get('/api/securite')).status, 403);
});

test('récupération d\'un administrateur : mot de passe provisoire à usage unique, journalisé', async () => {
  const id = (await E.admin.state()).me;
  const html = await post({ action: 'reinitialiser', admin: id });
  const tmp = html.match(/Mot de passe provisoire de « Administrateur » : ([0-9a-f]{18})/)[1];
  assert.ok(tmp);
  const c = srv.client();
  assert.equal((await c.login('Administrateur', tmp)).status, 200);
  assert.equal((await c.state()).mustChange, true, 'doit en choisir un autre');
  assert.equal((await E.admin.get('/api/rev')).status, 401, 'les anciennes sessions sont fermées');
  assert.equal((await c.post('/api/password', { oldPassword: tmp, newPassword: ADMIN_PW + '-bis' })).status, 200);
  const adm = srv.client(); await adm.login('Administrateur', ADMIN_PW + '-bis');
  assert.ok((await adm.get('/api/audit?action=admin.')).data.events.some(e => /maintenance/.test(e.detail)));
});

test('en ligne de commande : création et réinitialisation d\'un administrateur', async () => {
  const r = srv.cli('admin.php', ['creer', 'Secours']);
  assert.equal(r.status, 0, r.stderr);
  const mdp = r.stdout.match(/: ([0-9a-f]{18})/)[1];
  const c = srv.client(); assert.equal((await c.login('Secours', mdp)).status, 200);
  const st = await c.state(); assert.equal(st.mustChange, true);
  assert.notEqual(srv.cli('admin.php', ['creer', 'Secours']).status, 0, 'doublon refusé');
  assert.equal(srv.cli('admin.php', ['reinitialiser', 'Secours']).status, 0);
  assert.equal((await c.get('/api/rev')).status, 401);
});
