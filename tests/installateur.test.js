// Page d'installation (www/installer.php) : crée le premier administrateur, une seule fois.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer } = require('./aide');

let srv;
before(async () => { srv = await demarrer({ sansAdmin: true }); });
after(() => srv.stop());

const envoyer = (champs) => fetch(srv.base + '/installer.php', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(champs) });

test('la page vérifie l\'hébergement et propose de créer l\'administrateur', async () => {
  const html = await (await fetch(srv.base + '/installer.php')).text();
  assert.match(html, /Tables de la base prêtes/);
  assert.match(html, /name="nom"/);
  assert.doesNotMatch(html, /<li class="ko">/);
});

test('mot de passe trop court ou différent : refusé', async () => {
  assert.match(await (await envoyer({ nom: 'Sacha', mdp: 'court', mdp2: 'court' })).text(), /au moins 8 caractères/);
  assert.match(await (await envoyer({ nom: 'Sacha', mdp: 'MotDePasse2026', mdp2: 'autreChose2026' })).text(), /pas identiques/);
  assert.equal((await srv.client().get('/api/comptes')).data.users.length, 0);
});

test('création de l\'administrateur, puis connexion', async () => {
  const html = await (await envoyer({ nom: 'Sacha', mdp: 'MotDePasse2026', mdp2: 'MotDePasse2026' })).text();
  assert.match(html, /Installation terminée/);
  const c = srv.client();
  assert.equal((await c.login('Sacha', 'MotDePasse2026')).status, 200);
  const st = await c.state();
  assert.equal(st.me, st.users[0].id);
  assert.equal(st.users[0].role, 'admin');
  assert.equal(st.defaultAdminPassword, false);
});

test('une fois installé, la page ne permet plus de créer de compte', async () => {
  const html = await (await envoyer({ nom: 'Pirate', mdp: 'MotDePasse2026', mdp2: 'MotDePasse2026' })).text();
  assert.match(html, /déjà installée/);
  assert.equal((await srv.client().get('/api/comptes')).data.users.length, 1);
});
