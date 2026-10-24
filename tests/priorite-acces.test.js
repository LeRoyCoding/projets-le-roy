// Priorité, créateur de la tâche, adresse de connexion et QR code.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, tache } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());

test('priorité : normale par défaut, modifiable, valeur illisible ignorée', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g))).data.id;
  let t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.priority, 3);
  assert.equal((await E.claire.put('/api/tasks/' + id, { ...t, priority: 1 })).status, 200);
  t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.priority, 1);
  await E.claire.put('/api/tasks/' + id, { ...t, priority: 99 });
  assert.equal((await E.antoine.state()).tasks.find(x => x.id === id).priority, 1, 'valeur inconnue : on garde l\'ancienne');
  const id2 = (await E.antoine.post('/api/tasks', tache(E.ids.g, { priority: 4 }))).data.id;
  assert.equal((await E.antoine.state()).tasks.find(x => x.id === id2).priority, 4);
  const a = (await E.admin.get('/api/tasks/' + id + '/details')).data.activity;
  assert.match(a[0].detail, /priorité → urgente/);
});

test('créateur de la tâche visible', async () => {
  const id = (await E.claire.post('/api/tasks', tache(E.ids.g, { title: 'Créée par Claire' }))).data.id;
  const t = (await E.antoine.state()).tasks.find(x => x.id === id);
  assert.equal(t.createdBy, E.ids.c);
  assert.ok(t.createdAt);
});

test('adresse de connexion et QR code', async () => {
  assert.equal((await srv.client().get('/api/acces')).status, 401);
  const r = (await E.antoine.get('/api/acces')).data;
  assert.ok('principale' in r);
  if (r.principale) {
    assert.match(r.principale, /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/);
    assert.match(r.qr, /^<svg/);
  }
  const page = await fetch(srv.base + '/acces');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Projets Le Roy/);
});
