// Droits par groupe : responsable / membre / lecteur / étranger au groupe, appliqués par le serveur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, connecterNouveau, tache, ADMIN_PW, TEMP_PW } = require('./aide');

let srv, admin, U = {}, C = {}, G;
before(async () => {
  srv = await demarrer();
  admin = srv.client(); await admin.login('Administrateur', ADMIN_PW);
  for (const n of ['Resp', 'Mem', 'Lec', 'Ext']) U[n] = (await admin.post('/api/users', { name: n, password: TEMP_PW })).data.id;
  G = (await admin.post('/api/groups', { name: 'Atelier', icon: '🛠️', color: '#3F7CC0', members: [
    { id: U.Resp, role: 'responsable' }, { id: U.Mem, role: 'membre' }, { id: U.Lec, role: 'lecteur' }] })).data.id;
  for (const n of Object.keys(U)) C[n] = await connecterNouveau(srv, n);
});
after(() => srv.stop());

const creer = async (qui, extra = {}) => (await C[qui].post('/api/tasks', tache(G, extra))).data.id;
const vue = async (qui, id) => (await C[qui].state()).tasks.find(t => t.id === id);

test('les rôles sont visibles dans l\'état, avec les droits calculés par le serveur', async () => {
  const g = (await C.Mem.state()).groups.find(x => x.id === G);
  assert.equal(g.myRole, 'membre');
  assert.equal(g.canEdit, false); assert.equal(g.canCreate, true);
  assert.equal((await C.Lec.state()).groups.find(x => x.id === G).canCreate, false);
  assert.equal((await C.Resp.state()).groups.find(x => x.id === G).canEdit, true);
  const id = await creer('Mem', { title: 'Tâche de Mem' });
  assert.deepEqual((await vue('Mem', id)).can, { edit: true, delete: true, step: true, history: false });
  assert.deepEqual((await vue('Lec', id)).can, { edit: false, delete: false, step: false, history: false });
  assert.equal((await vue('Resp', id)).can.history, true);
});

test('étranger au groupe : ne voit rien, ne peut rien faire', async () => {
  const id = await creer('Resp', { title: 'Confidentiel' });
  assert.equal(await vue('Ext', id), undefined);
  assert.equal((await C.Ext.get('/api/tasks/' + id + '/details')).status, 404);
  assert.equal((await C.Ext.put('/api/tasks/' + id, tache(G))).status, 404);
  assert.equal((await C.Ext.del('/api/tasks/' + id)).status, 404);
  assert.equal((await C.Ext.post('/api/tasks/' + id + '/comments', { body: 'x' })).status, 404);
  assert.equal((await C.Ext.post('/api/tasks', tache(G))).status, 403);
  assert.equal((await C.Ext.put('/api/groups/' + G, { name: 'Piraté', members: [U.Ext] })).status, 404);
});

test('lecteur : voit seulement', async () => {
  const id = await creer('Resp', { title: 'Lisible', steps: [{ label: 'A' }] });
  const t = await vue('Lec', id);
  assert.ok(t, 'il la voit');
  assert.equal((await C.Lec.post('/api/tasks', tache(G))).status, 403);
  assert.equal((await C.Lec.patch('/api/steps/' + t.steps[0].id, { done: true })).status, 403);
  assert.equal((await C.Lec.post('/api/tasks/' + id + '/comments', { body: 'x' })).status, 403);
  assert.equal((await C.Lec.post('/api/tasks/' + id + '/steps', { label: 'x' })).status, 403);
  assert.equal((await C.Lec.put('/api/tasks/' + id, { ...t, title: 'Modifié' })).status, 403);
  assert.equal((await C.Lec.del('/api/tasks/' + id)).status, 403);
  assert.equal((await C.Lec.patch('/api/tasks/' + id + '/terminee', { completed: true })).status, 403);
});

test('membre : crée, coche, commente ; modifie ses tâches et celles de « tout le groupe » ; supprime les siennes', async () => {
  const miennes = await creer('Mem', { title: 'À moi', ownerId: U.Mem });
  const commune = await creer('Resp', { title: 'Pour tous', ownerId: null });
  const deResp = await creer('Resp', { title: 'À Resp', ownerId: U.Resp, steps: [{ label: 'E1' }] });
  const t = await vue('Mem', deResp);
  assert.equal((await C.Mem.patch('/api/steps/' + t.steps[0].id, { done: true })).status, 200, 'cocher une étape : permis');
  assert.equal((await C.Mem.post('/api/tasks/' + deResp + '/comments', { body: 'ok' })).status, 200);
  assert.equal((await C.Mem.put('/api/tasks/' + deResp, { ...t, title: 'Piraté' })).status, 403, 'tâche attribuée à un autre : pas de modification');
  assert.equal((await C.Mem.del('/api/tasks/' + deResp)).status, 403);
  assert.equal((await C.Mem.put('/api/tasks/' + commune, { ...(await vue('Mem', commune)), title: 'Pour tous (maj)' })).status, 200);
  assert.equal((await C.Mem.del('/api/tasks/' + commune)).status, 403, 'créée par un autre : pas de suppression');
  assert.equal((await C.Mem.put('/api/tasks/' + miennes, { ...(await vue('Mem', miennes)), title: 'À moi (maj)' })).status, 200);
  assert.equal((await C.Mem.del('/api/tasks/' + miennes)).status, 200);
  assert.equal((await C.Mem.get('/api/tasks/' + deResp + '/details')).data.activity.length, 0, 'historique réservé aux responsables');
});

test('tâche attribuée hors du groupe : refusée ; la personne désignée agit sur sa tâche même en lecture seule', async () => {
  assert.equal((await C.Resp.post('/api/tasks', tache(G, { title: 'Pour Ext', ownerId: U.Ext }))).status, 400, 'Ext n\'est pas du groupe');
  const id = await creer('Resp', { title: 'Mission Lec', ownerId: U.Lec, steps: [{ label: 'E1' }] });
  // Lec est lecteur : il peut tout de même cocher « sa » tâche, car elle lui est attribuée
  const t = await vue('Lec', id);
  assert.equal((await C.Lec.patch('/api/steps/' + t.steps[0].id, { done: true })).status, 200);
  assert.equal((await C.Lec.post('/api/tasks/' + id + '/comments', { body: 'fait' })).status, 200);
  assert.equal((await C.Lec.put('/api/tasks/' + id, { ...t, title: 'Renommée par Lec' })).status, 200, 'la personne désignée peut modifier sa tâche');
  assert.equal((await C.Lec.del('/api/tasks/' + id)).status, 403, 'mais pas la supprimer');
});

test('responsable : modifie et supprime toutes les tâches, gère les membres et leurs rôles', async () => {
  const id = await creer('Mem', { title: 'De Mem', ownerId: U.Mem });
  const t = await vue('Resp', id);
  assert.equal((await C.Resp.put('/api/tasks/' + id, { ...t, title: 'Corrigée' })).status, 200);
  const log = (await C.Resp.get('/api/tasks/' + id + '/details')).data.activity;
  assert.match(log[0].detail, /titre : « De Mem » → « Corrigée »/);
  assert.equal((await C.Resp.put('/api/groups/' + G, { name: 'Atelier+', icon: '🛠️', color: '#3F7CC0', members: [
    { id: U.Resp, role: 'responsable' }, { id: U.Mem, role: 'membre' }, { id: U.Lec, role: 'membre' }] })).status, 200);
  assert.equal((await vue('Lec', id)) !== undefined, true);
  assert.equal((await C.Lec.post('/api/tasks', tache(G, { title: 'Lec écrit' }))).status, 200, 'promu membre : peut créer');
  assert.equal((await C.Resp.del('/api/tasks/' + id)).status, 200);
  // le membre ne peut pas gérer le groupe
  assert.equal((await C.Mem.put('/api/groups/' + G, { name: 'Coup d\'état', members: [{ id: U.Mem, role: 'responsable' }] })).status, 403);
  // on remet le lecteur
  await C.Resp.put('/api/groups/' + G, { name: 'Atelier', icon: '🛠️', color: '#3F7CC0', members: [{ id: U.Resp, role: 'responsable' }, { id: U.Mem, role: 'membre' }, { id: U.Lec, role: 'lecteur' }] });
});

test('un groupe a toujours un responsable ; un responsable ne se retire pas lui-même', async () => {
  const r = await admin.put('/api/groups/' + G, { name: 'Atelier', icon: '🛠️', color: '#3F7CC0', members: [{ id: U.Mem, role: 'membre' }, { id: U.Lec, role: 'lecteur' }] });
  assert.equal(r.status, 200);
  const g = (await admin.state()).groups.find(x => x.id === G);
  assert.equal(Object.values(g.roles).filter(x => x === 'responsable').length, 1, 'un responsable désigné d\'office');
  // remise en état
  await admin.put('/api/groups/' + G, { name: 'Atelier', icon: '🛠️', color: '#3F7CC0', members: [{ id: U.Resp, role: 'responsable' }, { id: U.Mem, role: 'membre' }, { id: U.Lec, role: 'lecteur' }] });
  const moi = await C.Resp.put('/api/groups/' + G, { name: 'Atelier', icon: '🛠️', color: '#3F7CC0', members: [{ id: U.Mem, role: 'responsable' }] });
  assert.equal(moi.status, 400);
  assert.match(moi.data.error, /retirer vous-même/);
});

test('celui qui crée un groupe en devient responsable ; chacun garde un groupe privé dont il est responsable', async () => {
  const g = (await C.Mem.post('/api/groups', { name: 'Équipe Mem', icon: '📦', color: '#7A5AB5', members: [U.Lec] })).data.id;
  const st = (await C.Mem.state()).groups.find(x => x.id === g);
  assert.equal(st.myRole, 'responsable');
  assert.equal(st.roles[U.Lec], 'membre');
  const perso = (await C.Mem.state()).groups.find(x => x.name === 'Perso');
  assert.equal(perso.myRole, 'responsable');
});

test('administrateur : tous les droits partout', async () => {
  const id = await creer('Mem', { title: 'Vue admin', ownerId: U.Mem });
  const t = await vue('Resp', id);
  assert.equal((await admin.put('/api/tasks/' + id, { ...t, title: 'Admin y touche' })).status, 200);
  assert.equal((await admin.del('/api/tasks/' + id)).status, 200);
});

test('catégories : tout le monde en propose, seul l\'administrateur les gère', async () => {
  assert.equal((await C.Mem.post('/api/categories', { label: 'Nouvelle', emoji: '✨' })).status, 200);
  const k = (await admin.state()).categories.find(c => c.label === 'Nouvelle').id;
  assert.equal((await C.Mem.put('/api/categories/' + k, { label: 'Renommée', emoji: '✨' })).status, 403);
  assert.equal((await C.Resp.del('/api/categories/' + k)).status, 403);
  assert.equal((await C.Resp.post('/api/categories/ordre', { ids: [k] })).status, 403);
});

test('utilisateurs : liste et gestion réservées à l\'administrateur ; l\'e-mail n\'est visible que de lui', async () => {
  assert.equal((await C.Resp.post('/api/users', { name: 'X', password: TEMP_PW })).status, 403);
  await admin.put('/api/users/' + U.Mem, { email: 'mem@example.org' });
  const vuAdmin = (await admin.state()).users.find(u => u.id === U.Mem);
  const vuMem = (await C.Resp.state()).users.find(u => u.id === U.Mem);
  assert.equal(vuAdmin.email, 'mem@example.org');
  assert.equal(vuMem.email, undefined);
});
