const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, tache } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());

/* ---------- Catégories ---------- */
test('catégories : les 8 de départ existent', async () => {
  const st = await E.antoine.state();
  assert.deepEqual(st.categories.map(c => c.id), ['devis', 'chantier', 'commercial', 'dev', 'admin', 'prod', 'event', 'perso']);
});

test('catégories : création, doublon refusé, utilisation dans une tâche', async () => {
  const r = await E.antoine.post('/api/categories', { label: 'SAV', emoji: '🔧' });
  assert.equal(r.status, 200);
  assert.equal((await E.claire.post('/api/categories', { label: 'sav', emoji: '🔧' })).status, 400);
  assert.equal((await E.claire.post('/api/categories', { label: '' })).status, 400);
  const t = await E.antoine.post('/api/tasks', tache(E.ids.g, { type: r.data.id, title: 'Réparer' }));
  const st = await E.claire.state();
  assert.equal(st.tasks.find(x => x.id === t.data.id).type, r.data.id);
});

test('catégories : catégorie inconnue → première catégorie', async () => {
  const t = await E.antoine.post('/api/tasks', tache(E.ids.g, { type: 'nexistepas' }));
  const st = await E.antoine.state();
  assert.equal(st.tasks.find(x => x.id === t.data.id).type, 'devis');
});

test('catégories : masquer, puis refus pour une nouvelle tâche mais accepté pour une tâche existante', async () => {
  const c = (await E.antoine.post('/api/categories', { label: 'Ancienne', emoji: '📦' })).data.id;
  const t = (await E.antoine.post('/api/tasks', tache(E.ids.g, { type: c }))).data.id;
  assert.equal((await E.claire.put('/api/categories/' + c, { label: 'Ancienne', emoji: '📦', hidden: true })).status, 200);
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { type: c }))).status, 400);
  const st = await E.antoine.state();
  const task = st.tasks.find(x => x.id === t);
  assert.equal((await E.antoine.put('/api/tasks/' + t, { ...task, title: 'Renommée' })).status, 200);
});

test('catégories : suppression (vide = libre, utilisée = admin avec remplacement)', async () => {
  const vide = (await E.claire.post('/api/categories', { label: 'Vide', emoji: '🫙' })).data.id;
  assert.equal((await E.claire.del('/api/categories/' + vide)).status, 200);
  const c = (await E.antoine.post('/api/categories', { label: 'Utilisée', emoji: '🧲' })).data.id;
  const t = (await E.antoine.post('/api/tasks', tache(E.ids.g, { type: c }))).data.id;
  assert.equal((await E.antoine.del('/api/categories/' + c)).status, 400);
  assert.equal((await E.antoine.del('/api/categories/' + c + '?remplacer=chantier')).status, 403);
  const r = await E.admin.del('/api/categories/' + c + '?remplacer=chantier');
  assert.equal(r.status, 200);
  assert.equal(r.data.moved, 1);
  const st = await E.admin.state();
  assert.equal(st.tasks.find(x => x.id === t).type, 'chantier');
  assert.ok(!st.categories.some(x => x.id === c));
});

test('catégories : changer l\'ordre', async () => {
  const st = await E.admin.state();
  const ids = st.categories.map(c => c.id).reverse();
  assert.equal((await E.antoine.post('/api/categories/ordre', { ids })).status, 200);
  assert.deepEqual((await E.admin.state()).categories.map(c => c.id), ids);
});

/* ---------- Équipe ---------- */
test('équipe : l\'admin renomme, change le mot de passe, désactive', async () => {
  const id = (await E.admin.post('/api/users', { name: 'Julien', password: '0000' })).data.id;
  const julien = srv.client(); await julien.login('Julien', '0000');
  assert.equal((await E.claire.put('/api/users/' + id, { name: 'X' })).status, 403);
  assert.equal((await E.admin.put('/api/users/' + id, { name: 'Antoine' })).status, 400);
  assert.equal((await E.admin.put('/api/users/' + id, { name: 'Julien D.', password: '9999' })).status, 200);
  assert.equal((await julien.get('/api/state')).status, 401, 'déconnecté après changement de mot de passe');
  const j2 = srv.client();
  assert.equal((await j2.login('Julien D.', '9999')).status, 200);
  assert.equal((await E.admin.put('/api/users/' + id, { active: false })).status, 200);
  assert.equal((await j2.get('/api/state')).status, 401);
  const comptes = (await srv.client().get('/api/comptes')).data.users;
  assert.ok(!comptes.some(u => u.id === id), 'masqué de l\'écran de connexion');
  const st = await E.admin.state();
  assert.equal(st.users.find(u => u.id === id).active, false);
  // On ne peut plus lui attribuer de tâche
  assert.equal((await E.admin.post('/api/tasks', tache(E.ids.g, { ownerId: id }))).status, 400);
  assert.equal((await E.admin.put('/api/users/' + id, { active: true })).status, 200);
});

test('équipe : on garde toujours un admin actif', async () => {
  const st = await E.admin.state();
  const adminId = st.me;
  assert.equal((await E.admin.put('/api/users/' + adminId, { active: false })).status, 400);
  assert.equal((await E.admin.put('/api/users/' + adminId, { role: 'user' })).status, 400);
  const b = (await E.admin.post('/api/users', { name: 'Chef', password: '0000', role: 'admin' })).data.id;
  assert.equal((await E.admin.put('/api/users/' + b, { role: 'user' })).status, 200);
});

/* ---------- Tâches : terminées, commentaires, historique ---------- */
test('tâche sans étapes : terminée à la main', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { steps: [] }))).data.id;
  assert.equal((await E.claire.patch('/api/tasks/' + id + '/terminee', { completed: true })).status, 200);
  let t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.completed, true);
  // Ajouter une étape rouvre la tâche
  await E.antoine.post('/api/tasks/' + id + '/steps', { label: 'Encore une chose' });
  t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.completed, false);
});

test('commentaires : visibles du groupe, suppression par l\'auteur ou l\'admin', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g))).data.id;
  const c = (await E.claire.post('/api/tasks/' + id + '/comments', { body: 'Client relancé ce matin' })).data.id;
  assert.equal((await E.claire.post('/api/tasks/' + id + '/comments', { body: '  ' })).status, 400);
  const d = (await E.antoine.get('/api/tasks/' + id + '/details')).data;
  assert.equal(d.comments[0].body, 'Client relancé ce matin');
  assert.equal((await E.antoine.state()).tasks.find(x => x.id === id).comments, 1);
  assert.equal((await E.antoine.del('/api/comments/' + c)).status, 403);
  assert.equal((await E.claire.del('/api/comments/' + c)).status, 200);
  // Tâche privée : pas de commentaire possible pour les autres
  const p = (await E.antoine.post('/api/tasks', tache(E.ids.persoA))).data.id;
  assert.equal((await E.claire.post('/api/tasks/' + p + '/comments', { body: 'x' })).status, 404);
  assert.equal((await E.claire.get('/api/tasks/' + p + '/details')).status, 404);
});

test('historique : création, étapes cochées, modifications', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g))).data.id;
  let t = (await E.antoine.state()).tasks.find(x => x.id === id);
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true });
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true }); // déjà cochée : pas de doublon
  await E.antoine.put('/api/tasks/' + id, { ...t, title: 'Nouveau titre', end: '2026-11-15' });
  assert.deepEqual((await E.antoine.get('/api/tasks/' + id + '/details')).data.activity, [], 'journal réservé à l\'admin');
  const a = (await E.admin.get('/api/tasks/' + id + '/details')).data.activity;
  assert.deepEqual(a.map(x => x.action), ['modification', 'etape_cochee', 'creation']);
  assert.match(a[0].detail, /titre/);
  assert.match(a[0].detail, /15\/11\/2026/);
  assert.equal(a[1].detail, 'Étape 1');
});

/* ---------- Clés d'accès ---------- */
test('clés d\'accès : création, utilisation, suppression', async () => {
  const r = await E.antoine.post('/api/tokens', { name: 'Claude' });
  assert.match(r.data.token, /^lr_/);
  const outil = srv.client();
  outil.setBearer(r.data.token);
  const st = await outil.state();
  assert.equal(st.me, E.ids.a);
  assert.equal((await outil.post('/api/tasks', tache(E.ids.g, { title: 'Créée par Claude' }))).status, 200);
  assert.equal((await outil.post('/api/tokens', {})).status, 403);
  const list = (await E.antoine.get('/api/tokens')).data.tokens;
  assert.equal(list.length, 1);
  assert.ok(list[0].lastUsed);
  assert.equal((await E.claire.del('/api/tokens/' + list[0].id)).status, 404);
  assert.equal((await E.antoine.del('/api/tokens/' + list[0].id)).status, 200);
  assert.equal((await outil.get('/api/state')).status, 401);
  outil.setBearer('lr_faux');
  assert.equal((await outil.get('/api/state')).status, 401);
});

/* ---------- Sauvegarde ---------- */
test('sauvegarde téléchargeable par l\'admin seulement', async () => {
  assert.equal((await E.claire.get('/api/sauvegarde')).status, 403);
  const res = await E.admin.raw('GET', '/api/sauvegarde');
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
});

test('version renvoyée', async () => {
  assert.match((await E.antoine.state()).version, /^\d+\.\d+\.\d+/);
});
