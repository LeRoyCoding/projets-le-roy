// Installateur (www/installer.php) : protégé par la clé de maintenance, une seule fois, mot de passe fort.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer } = require('./aide');

const KEY = 'cle-de-maintenance-de-test-0123456789abcdef';
let srv;
before(async () => { srv = await demarrer({ sansAdmin: true, maintenanceKey: KEY }); });
after(() => srv.stop());

const post = (champs, page = '/installer.php') => fetch(srv.base + page, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(champs) });
const MDP = 'Une-phrase-longue-2026';

test('sans clé : formulaire de clé seulement, rien d\'autre', async () => {
  const html = await (await fetch(srv.base + '/installer.php')).text();
  assert.match(html, /Clé de maintenance/);
  assert.doesNotMatch(html, /name="nom"/);
  assert.doesNotMatch(html, /Tables de la base/);
  // Une clé dans l'adresse n'est pas lue
  const g = await (await fetch(srv.base + '/installer.php?cle=' + KEY + '&action=creer')).text();
  assert.match(g, /Clé de maintenance/);
});

test('mauvaise clé refusée, puis blocage après 5 erreurs', async () => {
  for (let i = 0; i < 5; i++) assert.match(await (await post({ cle: 'mauvaise-' + i })).text(), /Clé incorrecte|Trop d(&#039;|')essais/);
  assert.match(await (await post({ cle: KEY })).text(), /Trop d(&#039;|')essais/, 'même la bonne clé est bloquée un moment');
  require('fs').rmSync(srv.data + '/etat/webtool-essais.json', { force: true });
});

test('la base n\'est PAS modifiée tant que la clé n\'est pas valide', async () => {
  assert.equal(srv.cli('migrer.php').stdout.includes('absent'), true);
});

test('avec la bonne clé : vérifications, tables créées, formulaire administrateur', async () => {
  const html = await (await post({ cle: KEY })).text();
  assert.match(html, /Tables de la base prêtes/);
  assert.match(html, /name="nom"/);
  assert.doesNotMatch(html, /<li class="ko">/);
});

test('mot de passe trop court, trop courant ou différent : refusé', async () => {
  const base = { cle: KEY, action: 'creer', nom: 'Sacha' };
  assert.match(await (await post({ ...base, mdp: 'Court-1', mdp2: 'Court-1' })).text(), /au moins 12 caractères/);
  assert.match(await (await post({ ...base, mdp: 'motdepasse1234', mdp2: 'motdepasse1234' })).text(), /trop courant/);
  assert.match(await (await post({ ...base, mdp: 'sacha-sacha-sacha', mdp2: 'sacha-sacha-sacha' })).text(), /nom/);
  assert.match(await (await post({ ...base, mdp: MDP, mdp2: 'Autre-phrase-longue-2026' })).text(), /pas identiques/);
  assert.equal((await srv.client().get('/api/comptes')).status, 200);
  assert.equal(srv.cli('migrer.php').stdout.includes('ok'), true);
});

test('création de l\'administrateur, puis connexion', async () => {
  const html = await (await post({ cle: KEY, action: 'creer', nom: 'Sacha', mdp: MDP, mdp2: MDP })).text();
  assert.match(html, /Installation terminée/);
  const c = srv.client();
  assert.equal((await c.login('Sacha', MDP)).status, 200);
  const st = await c.state();
  assert.equal(st.myRole, 'admin');
  assert.notEqual(st.mustChange, true);
});

test('une fois installé, plus aucun compte ne peut être créé (même avec la clé)', async () => {
  const html = await (await post({ cle: KEY, action: 'creer', nom: 'Pirate', mdp: MDP + 'x', mdp2: MDP + 'x' })).text();
  assert.match(html, /déjà installée/);
  const c = srv.client(); await c.login('Sacha', MDP);
  assert.equal((await c.get('/api/state')).data.users.length, 1);
});

test('le journal garde la trace de l\'installation', async () => {
  const c = srv.client(); await c.login('Sacha', MDP);
  const ev = (await c.get('/api/audit?action=installation')).data.events;
  assert.equal(ev.length, 1);
  assert.match(ev[0].detail, /Sacha/);
});
