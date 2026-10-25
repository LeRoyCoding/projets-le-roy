// Sécurité : mots de passe, essais répétés, sessions, origine des requêtes, clés d'accès, journal.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { demarrer, equipe, tache, PW, TEMP_PW, ADMIN_PW } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());

test('mots de passe : longueur, mots courants, nom, suites, ancien mot de passe', async () => {
  const cas = [['court-1A', /12 caractères/], ['motdepasse2026', /trop courant/], ['Claire-Claire-1', /nom/], ['leroy-leroy-1234', /entreprise/], ['aaaaaaaaaaaaaaaa', /répétitif/], ['1234567890123', /suite/], ['azertyuiop12', /trop courant|suite/]];
  for (const [mdp, re] of cas) {
    const r = await E.claire.post('/api/password', { oldPassword: PW, newPassword: mdp });
    assert.equal(r.status, 400, mdp);
    assert.match(r.data.error, re, mdp);
  }
  assert.match((await E.claire.post('/api/password', { oldPassword: PW, newPassword: PW })).data.error, /différent/);
  assert.equal((await E.admin.post('/api/users', { name: 'Faible', password: 'password1234' })).status, 400);
});

test('changer son mot de passe : demande l\'ancien, déconnecte les autres appareils', async () => {
  const autre = srv.client(); await autre.login('Claire', PW);
  assert.equal((await E.claire.post('/api/password', { oldPassword: 'faux-faux-faux-1', newPassword: 'Nouvelle-phrase-2026' })).status, 400);
  assert.equal((await E.claire.post('/api/password', { oldPassword: PW, newPassword: 'Nouvelle-phrase-2026' })).status, 200);
  assert.equal((await autre.get('/api/state')).status, 401);
  assert.equal((await E.claire.get('/api/state')).status, 200);
  assert.equal((await srv.client().login('Claire', PW)).status, 401);
  assert.equal((await srv.client().login('Claire', 'Nouvelle-phrase-2026')).status, 200);
  await E.claire.post('/api/password', { oldPassword: 'Nouvelle-phrase-2026', newPassword: PW });
});

test('mot de passe provisoire : tout est bloqué sauf le changement du mot de passe', async () => {
  const id = (await E.admin.post('/api/users', { name: 'Stagiaire', password: TEMP_PW })).data.id;
  const c = srv.client(); await c.login('Stagiaire', TEMP_PW);
  for (const [m, u] of [['GET', '/api/rev'], ['GET', '/api/tokens'], ['POST', '/api/tasks'], ['GET', '/api/corbeille']]) {
    const r = await c.raw(m, u, m === 'GET' ? undefined : {});
    assert.equal(r.status, 403, u);
    assert.equal((await r.json()).code, 'must_change');
  }
  assert.equal((await c.post('/api/password', { oldPassword: TEMP_PW, newPassword: PW })).status, 200);
  assert.equal((await c.get('/api/rev')).status, 200);
  assert.notEqual((await c.state()).mustChange, true);
  await E.admin.put('/api/users/' + id, { active: false });
});

test('connexion : message identique pour un compte inconnu et un mauvais mot de passe', async () => {
  const a = await srv.client().login('Fantome', 'nimporte-quoi-1234');
  const b = await srv.client().login('Antoine', 'nimporte-quoi-1234');
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.data.error, b.data.error);
});

test('cookie de session : HttpOnly, SameSite=Strict, valeur aléatoire non stockée en clair', async () => {
  const res = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Claire', password: PW }) });
  const set = res.headers.get('set-cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Strict/i);
  const token = set.match(/lr_session=([0-9a-f]{64})/)[1];
  assert.ok(token);
  // La base ne contient que l'empreinte : le jeton lui-même n'y figure pas
  const out = srv.cli('_cli.php').status; // (l'outil charge la config de test)
  assert.equal(out, 0);
  const q = require('child_process').spawnSync('mysql', ['-uroot', srv.nom, '-N', '-e', `SELECT COUNT(*) FROM sessions WHERE token = '${token}'`], { encoding: 'utf8' });
  assert.equal(q.stdout.trim(), '0');
});

test('session : expiration absolue et par inactivité', async () => {
  const id = (await E.admin.post('/api/users', { name: 'Sessions', password: TEMP_PW })).data.id;
  const only = `user_id = '${id}'`;
  const c = srv.client(); await c.login('Sessions', TEMP_PW);
  assert.equal((await c.get('/api/state')).status, 200);
  srv.sql(`UPDATE sessions SET last_seen = UTC_TIMESTAMP() - INTERVAL 15 DAY WHERE ${only}`);
  assert.equal((await c.get('/api/state')).status, 401, 'inactive depuis 15 jours');
  const d = srv.client(); await d.login('Sessions', TEMP_PW);
  srv.sql(`UPDATE sessions SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE ${only}`);
  assert.equal((await d.get('/api/state')).status, 401, 'durée maximale dépassée');
});

test('déconnexion : la session est détruite côté serveur', async () => {
  const c = srv.client(); await c.login('Claire', PW);
  const cookie = (await c.raw('GET', '/api/rev')).status; assert.equal(cookie, 200);
  const copie = srv.client(); copie.setHeader('cookie', 'x=1');
  // on rejoue l'ancien cookie après déconnexion
  let saved = null;
  const raw = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Claire', password: PW }) });
  saved = raw.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(srv.base + '/api/rev', { headers: { cookie: saved } })).status, 200);
  await fetch(srv.base + '/api/logout', { method: 'POST', headers: { cookie: saved, 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await fetch(srv.base + '/api/rev', { headers: { cookie: saved } })).status, 401);
});

test('requêtes venant d\'un autre site refusées (origine), clés d\'accès exemptées', async () => {
  const login = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Claire', password: PW }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = headers => fetch(srv.base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify(tache(E.ids.g, { title: 'Origine' })) });
  assert.equal((await post({ origin: 'https://pirate.example' })).status, 403);
  assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post({ origin: srv.base })).status, 200);
  assert.equal((await post({})).status, 200);
});

test('clés d\'accès : seulement en en-tête, droits limités, jamais affichées en entier', async () => {
  const r = (await E.antoine.post('/api/tokens', { name: 'Test clé' })).data;
  const key = r.token;
  const outil = srv.client();
  // Dans l'adresse : sans effet
  assert.equal((await fetch(srv.base + '/api/state?key=' + key)).status, 401);
  assert.equal((await fetch(srv.base + '/api/state?token=' + key, { headers: {} })).status, 401);
  outil.setBearer(key);
  assert.equal((await outil.get('/api/state')).status, 200);
  // Pas de suppression, pas d'administration, pas de nouvelles clés, pas de changement de mot de passe
  const t = (await outil.post('/api/tasks', tache(E.ids.g, { title: 'Par clé' }))).data.id;
  assert.equal((await outil.del('/api/tasks/' + t)).status, 403);
  assert.equal((await outil.post('/api/tokens', {})).status, 403);
  assert.equal((await outil.post('/api/password', { oldPassword: PW, newPassword: 'Autre-phrase-2026' })).status, 403);
  assert.equal((await outil.get('/api/audit')).status, 403);
  // Liste : préfixe seulement
  const liste = (await E.antoine.get('/api/tokens')).data.tokens.find(x => x.name === 'Test clé');
  assert.equal(liste.prefix, key.slice(0, 11));
  assert.ok(!JSON.stringify(liste).includes(key));
  assert.ok(liste.expiresAt);
  // Même un administrateur ne peut pas administrer par une clé
  const ka = (await E.admin.post('/api/tokens', { name: 'Admin' })).data.token;
  const oa = srv.client(); oa.setBearer(ka);
  assert.equal((await oa.get('/api/securite')).status, 403);
});

test('administrateur : liste et révoque toutes les clés, ferme les sessions d\'un compte', async () => {
  const k = (await E.claire.post('/api/tokens', { name: 'Claire-clé' })).data;
  const all = (await E.admin.get('/api/securite/cles')).data.tokens;
  assert.ok(all.some(x => x.name === 'Claire-clé' && x.userName === 'Claire'));
  assert.equal((await E.antoine.get('/api/securite/cles')).status, 403);
  assert.equal((await E.admin.del('/api/securite/cles/' + k.id)).status, 200);
  const o = srv.client(); o.setBearer(k.token);
  assert.equal((await o.get('/api/state')).status, 401);
  const c = srv.client(); await c.login('Claire', PW);
  assert.equal((await E.admin.post('/api/securite/deconnecter/' + E.ids.c, {})).status, 200);
  assert.equal((await c.get('/api/rev')).status, 401);
});

test('journal : connexions, comptes, clés, mots de passe — réservé à l\'administrateur', async () => {
  assert.equal((await E.antoine.get('/api/audit')).status, 403);
  const ev = (await E.admin.get('/api/audit?limite=500')).data.events;
  const actions = new Set(ev.map(e => e.action));
  for (const a of ['connexion.ok', 'connexion.echec', 'compte.cree', 'mot_de_passe.change', 'cle.creee', 'cle.revoquee', 'compte.deconnecte']) assert.ok(actions.has(a), 'manque ' + a);
  const texte = JSON.stringify(ev);
  assert.ok(!texte.includes(PW) && !texte.includes(TEMP_PW) && !texte.includes(ADMIN_PW), 'aucun mot de passe dans le journal');
  assert.ok(!/lr_[0-9a-f]{64}/.test(texte), 'aucune clé dans le journal');
  const filtre = (await E.admin.get('/api/audit?action=cle.')).data.events;
  assert.ok(filtre.length > 0 && filtre.every(e => e.action.startsWith('cle.')));
});

test('blocage progressif après 5 erreurs, par compte ; les autres comptes ne sont pas touchés', async () => {
  await E.admin.post('/api/users', { name: 'Victime', password: TEMP_PW });
  const c = srv.client();
  for (let i = 0; i < 5; i++) assert.equal((await c.login('Victime', 'mauvais-mdp-' + i + '-xyz')).status, 401);
  const bloque = await c.login('Victime', TEMP_PW);
  assert.equal(bloque.status, 429, 'même le bon mot de passe est refusé pendant le blocage');
  assert.match(bloque.data.error, /Patientez/);
  assert.equal((await srv.client().login('Antoine', PW)).status, 200);
  assert.ok((await E.admin.get('/api/audit?action=connexion.bloquee')).data.events.length > 0);
});

test('fichiers sensibles : .htaccess les interdit, le dépôt ne contient aucun secret', () => {
  const ht = fs.readFileSync(path.join(__dirname, '..', 'www', '.htaccess'), 'utf8');
  for (const motif of ['config', 'sql', 'log', 'bak', 'zip', 'gz', 'env', 'pem', 'Options -Indexes', 'Strict-Transport-Security', 'Content-Security-Policy']) assert.ok(ht.includes(motif), 'manque ' + motif);
  const www = path.join(__dirname, '..', 'www');
  const interdits = [];
  (function parcourir(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) parcourir(p); else if (/^(config\.php|.*\.sql|.*\.log|.*\.pem|.*\.key|\.env)$/.test(f.name)) interdits.push(p); } })(www);
  assert.deepEqual(interdits, []);
});
