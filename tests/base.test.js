const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, tache, TEMP_PW } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());

test('dates : refuse les dates impossibles', async () => {
  for (const end of ['2026-02-31', '2026-13-01', '26-1-1']) {
    assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { end }))).status, 400, end);
  }
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { start: '2028-02-29', end: '2028-03-01' }))).status, 200);
});

test('sans connexion : aucune donnée', async () => {
  const c = srv.client();
  assert.equal((await c.get('/api/state')).status, 401);
  assert.equal((await c.post('/api/tasks', tache(E.ids.g))).status, 401);
});

test('modifications refusées sans contenu JSON (protection contre les autres sites)', async () => {
  const res = await fetch(srv.base + '/api/logout', { method: 'POST', body: 'x' });
  assert.equal(res.status, 415);
});

test('JSON illisible : réponse claire', async () => {
  const res = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oups' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /illisible/);
});

test('chaque utilisateur reçoit son groupe Perso', async () => {
  const st = await E.antoine.state();
  const perso = st.groups.filter(g => g.name === 'Perso');
  assert.equal(perso.length, 1);
  assert.deepEqual(perso[0].members, [E.ids.a]);
});

test('visibilité : une tâche Perso reste privée', async () => {
  const r = await E.antoine.post('/api/tasks', tache(E.ids.persoA, { title: 'Secret' }));
  assert.equal(r.status, 200);
  const claire = await E.claire.state();
  assert.ok(!claire.tasks.some(t => t.title === 'Secret'));
  const admin = await E.admin.state();
  assert.ok(admin.tasks.some(t => t.title === 'Secret'));
  assert.equal((await E.claire.del('/api/tasks/' + r.data.id)).status, 404, 'une tâche invisible n\'existe pas pour elle');
  assert.equal((await E.claire.post('/api/tasks', tache(E.ids.persoA))).status, 403);
});

test('groupe commun : chacun voit et fait avancer les tâches', async () => {
  const r = await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Commune', ownerId: null }));
  const st = await E.claire.state();
  const t = st.tasks.find(x => x.id === r.data.id);
  assert.equal(t.ownerId, null);
  assert.equal((await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true })).status, 200);
  const t2 = (await E.antoine.state()).tasks.find(x => x.id === r.data.id);
  assert.equal(t2.steps[0].done, true);
});

test('modifier une tâche garde les étapes cochées et leur ordre', async () => {
  const r = await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Ordre' }));
  let t = (await E.antoine.state()).tasks.find(x => x.id === r.data.id);
  await E.antoine.patch('/api/steps/' + t.steps[0].id, { done: true });
  t = (await E.antoine.state()).tasks.find(x => x.id === r.data.id);
  const steps = [t.steps[1], t.steps[0], { label: 'Nouvelle' }];
  assert.equal((await E.antoine.put('/api/tasks/' + t.id, { ...t, steps })).status, 200);
  t = (await E.antoine.state()).tasks.find(x => x.id === r.data.id);
  assert.deepEqual(t.steps.map(s => s.label + (s.done ? '✓' : '')), ['Étape 2', 'Étape 1✓', 'Nouvelle']);
});

test('validation des tâches', async () => {
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { title: '' }))).status, 400);
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { start: '2026-11-01', end: '2026-10-01' }))).status, 400);
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { end: '2026-02-31' }))).status, 400);
  assert.equal((await E.antoine.post('/api/tasks', tache(E.ids.g, { steps: 'oups' }))).status, 400);
  assert.equal((await E.antoine.post('/api/tasks', tache('inconnu'))).status, 400);
});

test('groupes : suppression impossible tant qu\'il reste des tâches', async () => {
  assert.equal((await E.admin.del('/api/groups/' + E.ids.g)).status, 400);
  const g = (await E.antoine.post('/api/groups', { name: 'Vide', icon: '📦', color: '#3F7CC0', members: [] })).data.id;
  const st = await E.antoine.state();
  assert.deepEqual(st.groups.find(x => x.id === g).members, [E.ids.a]);
  assert.equal((await E.claire.del('/api/groups/' + g)).status, 404);
  assert.equal((await E.antoine.del('/api/groups/' + g)).status, 200);
});

test('comptes : seul l\'admin crée des utilisateurs', async () => {
  assert.equal((await E.claire.post('/api/users', { name: 'Z', password: TEMP_PW })).status, 403);
  assert.equal((await E.admin.post('/api/users', { name: 'antoine', password: TEMP_PW })).status, 400);
});

