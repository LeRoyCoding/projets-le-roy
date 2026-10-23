// Ordre des groupes, tâches terminées (qui / quand), disparition après 7 jours, historique admin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, tache } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());

test('ordre des groupes : réglé par l\'admin, appliqué à tout le monde', async () => {
  const st = await E.admin.state();
  const ids = st.groups.map(g => g.id);
  assert.equal((await E.antoine.post('/api/groups/ordre', { ids: [...ids].reverse() })).status, 403);
  assert.equal((await E.admin.post('/api/groups/ordre', { ids: [...ids].reverse() })).status, 200);
  assert.deepEqual((await E.admin.state()).groups.map(g => g.id), [...ids].reverse());
  // Un nouveau groupe arrive en dernier
  const g = (await E.antoine.post('/api/groups', { name: 'Nouveau', icon: '📦', color: '#3F7CC0', members: [] })).data.id;
  const apres = (await E.admin.state()).groups.map(x => x.id);
  assert.equal(apres[apres.length - 1], g);
});

test('étape cochée : on sait qui et quand ; décochée : effacé', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g))).data.id;
  let t = (await E.claire.state()).tasks.find(x => x.id === id);
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true });
  t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.steps[0].doneBy, E.ids.c);
  assert.match(t.steps[0].doneAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: false });
  t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.steps[0].doneBy, null);
});

test('tâche terminée : qui a validé la dernière étape et quand ; rouverte : effacé', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g))).data.id;
  let t = (await E.antoine.state()).tasks.find(x => x.id === id);
  await E.antoine.patch('/api/steps/' + t.steps[0].id, { done: true });
  assert.equal((await E.antoine.state()).tasks.find(x => x.id === id).doneAt, null);
  await E.claire.patch('/api/steps/' + t.steps[1].id, { done: true });
  t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.doneBy, E.ids.c);
  assert.ok(t.doneAt);
  // Ajouter une étape rouvre la tâche
  await E.antoine.post('/api/tasks/' + id + '/steps', { label: 'Encore' });
  assert.equal((await E.antoine.state()).tasks.find(x => x.id === id).doneAt, null);
});

test('tâche sans étapes marquée terminée : validée par la personne', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { steps: [] }))).data.id;
  await E.claire.patch('/api/tasks/' + id + '/terminee', { completed: true });
  assert.equal((await E.admin.state()).tasks.find(x => x.id === id).doneBy, E.ids.c);
});

test('après 7 jours, une tâche terminée disparaît de l\'écran mais reste dans l\'historique (admin)', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Vieille tâche', steps: [{ label: 'A' }] }))).data.id;
  const t = (await E.antoine.state()).tasks.find(x => x.id === id);
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true });
  // On simule une validation il y a 8 jours
  srv.db.prepare("UPDATE tasks SET done_at = datetime('now', '-8 days') WHERE id = ?").run(id);
  assert.ok(!(await E.antoine.state()).tasks.some(x => x.id === id), 'masquée pour les utilisateurs');
  assert.ok(!(await E.admin.state()).tasks.some(x => x.id === id), 'masquée aussi sur l\'accueil de l\'admin');
  assert.equal((await E.antoine.get('/api/historique')).status, 403);
  const h = (await E.admin.get('/api/historique')).data;
  const x = h.tasks.find(y => y.id === id);
  assert.ok(x);
  assert.equal(x.archived, true);
  assert.equal(x.doneBy, E.ids.c);
  assert.equal(x.steps[0].doneBy, E.ids.c);
  assert.equal(h.jours, 7);
  // Une tâche terminée récemment est aussi dans l'historique, non archivée
  assert.ok(h.tasks.some(y => !y.archived));
});
