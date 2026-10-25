// Corbeille : suppression récupérable, restauration, suppression définitive réservée à l'administrateur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, connecterNouveau, tache, ADMIN_PW, TEMP_PW } = require('./aide');

let srv, admin, U = {}, C = {}, G;
before(async () => {
  srv = await demarrer();
  admin = srv.client(); await admin.login('Administrateur', ADMIN_PW);
  for (const n of ['Resp', 'Mem']) U[n] = (await admin.post('/api/users', { name: n, password: TEMP_PW })).data.id;
  G = (await admin.post('/api/groups', { name: 'Chantiers', icon: '🏗️', color: '#D08A1E', members: [{ id: U.Resp, role: 'responsable' }, { id: U.Mem, role: 'membre' }] })).data.id;
  for (const n of Object.keys(U)) C[n] = await connecterNouveau(srv, n);
});
after(() => srv.stop());

const creer = async (qui, extra = {}) => (await C[qui].post('/api/tasks', tache(G, extra))).data.id;
const dans = async (qui, id) => (await C[qui].state()).tasks.some(t => t.id === id);

test('supprimer met à la corbeille : la tâche disparaît partout, rien n\'est perdu', async () => {
  const id = await creer('Mem', { title: 'À supprimer', steps: [{ label: 'E1', done: true }, { label: 'E2' }] });
  await C.Mem.post('/api/tasks/' + id + '/comments', { body: 'un commentaire' });
  assert.equal((await C.Mem.del('/api/tasks/' + id)).status, 200);
  assert.equal(await dans('Mem', id), false);
  assert.equal(await dans('Resp', id), false);
  assert.equal(await dans('Mem', id), false);
  assert.equal((await C.Mem.get('/api/tasks/' + id + '/details')).status, 404);
  assert.equal((await C.Mem.put('/api/tasks/' + id, tache(G))).status, 404);
  assert.ok(!(await admin.get('/api/historique')).data.tasks.some(t => t.id === id));
  // La ligne existe toujours en base, avec qui et quand
  const t = (await C.Resp.get('/api/corbeille')).data.tasks.find(x => x.id === id);
  assert.equal(t.deletedBy, (await C.Mem.state()).me);
  assert.ok(t.deletedAt);
  assert.equal(t.joursRestants, 90);
});

test('restaurer : tâche, étapes cochées, commentaires et historique reviennent intacts', async () => {
  const id = await creer('Mem', { title: 'Précieuse', steps: [{ label: 'A', done: true }, { label: 'B' }] });
  await C.Mem.post('/api/tasks/' + id + '/comments', { body: 'à garder' });
  await C.Mem.del('/api/tasks/' + id);
  assert.equal((await C.Mem.post('/api/corbeille/tache/' + id + '/restaurer', {})).status, 403, 'un simple membre ne restaure pas');
  assert.equal((await C.Resp.post('/api/corbeille/tache/' + id + '/restaurer', {})).status, 200);
  const t = (await C.Mem.state()).tasks.find(x => x.id === id);
  assert.deepEqual(t.steps.map(s => s.label + (s.done ? '✓' : '')), ['A✓', 'B']);
  assert.equal((await C.Mem.get('/api/tasks/' + id + '/details')).data.comments[0].body, 'à garder');
  const h = (await C.Resp.get('/api/tasks/' + id + '/details')).data.activity.map(a => a.action);
  assert.deepEqual(h.slice(0, 2), ['restauree', 'supprimee']);
  assert.equal((await C.Resp.post('/api/corbeille/tache/' + id + '/restaurer', {})).status, 404, 'plus dans la corbeille');
});

test('qui voit quoi dans la corbeille', async () => {
  const id = await creer('Mem', { title: 'Visible corbeille' });
  await C.Mem.del('/api/tasks/' + id);
  assert.equal((await C.Mem.get('/api/corbeille')).data.tasks.length, 0, 'un membre ne voit pas la corbeille');
  assert.ok((await C.Resp.get('/api/corbeille')).data.tasks.some(t => t.id === id));
  assert.ok((await admin.get('/api/corbeille')).data.tasks.some(t => t.id === id));
  assert.ok((await C.Resp.state()).corbeille >= 1);
  assert.equal((await C.Mem.state()).corbeille, 0);
  // Un responsable d'un autre groupe ne voit pas celle-ci
  const autre = (await admin.post('/api/users', { name: 'Autre', password: TEMP_PW })).data.id;
  const ca = await connecterNouveau(srv, 'Autre');
  assert.equal((await ca.get('/api/corbeille')).data.tasks.some(t => t.id === id), false);
  assert.equal((await ca.post('/api/corbeille/tache/' + id + '/restaurer', {})).status, 403);
});

test('suppression définitive : administrateur seulement, et journalisée', async () => {
  const id = await creer('Resp', { title: 'À purger' });
  await C.Resp.del('/api/tasks/' + id);
  assert.equal((await C.Resp.del('/api/corbeille/tache/' + id)).status, 403);
  assert.equal((await C.Mem.del('/api/corbeille/tache/' + id)).status, 403);
  assert.equal((await admin.del('/api/corbeille/tache/' + id)).status, 200);
  assert.ok(!(await admin.get('/api/corbeille')).data.tasks.some(t => t.id === id));
  const ev = (await admin.get('/api/audit?action=tache.')).data.events;
  assert.ok(ev.some(e => e.action === 'tache.purgee' && /À purger/.test(e.detail)));
  assert.ok(ev.some(e => e.action === 'tache.supprimee' && /À purger/.test(e.detail)));
});

test('groupes : corbeille et restauration ; une tâche ne revient pas dans un groupe supprimé', async () => {
  const g = (await C.Resp.post('/api/groups', { name: 'Éphémère', icon: '📦', color: '#7A5AB5', members: [U.Mem] })).data.id;
  const t = (await C.Resp.post('/api/tasks', tache(g, { title: 'Dans éphémère' }))).data.id;
  assert.equal((await C.Resp.del('/api/groups/' + g)).status, 400, 'pas vide');
  await C.Resp.del('/api/tasks/' + t);
  assert.equal((await C.Mem.del('/api/groups/' + g)).status, 403);
  assert.equal((await C.Resp.del('/api/groups/' + g)).status, 200);
  assert.ok(!(await C.Resp.state()).groups.some(x => x.id === g));
  const cor = (await C.Resp.get('/api/corbeille')).data;
  assert.ok(cor.groups.some(x => x.id === g));
  assert.equal((await C.Resp.post('/api/corbeille/tache/' + t + '/restaurer', {})).status, 409);
  assert.equal((await C.Mem.post('/api/corbeille/groupe/' + g + '/restaurer', {})).status, 403);
  assert.equal((await C.Resp.post('/api/corbeille/groupe/' + g + '/restaurer', {})).status, 200);
  assert.equal((await C.Resp.post('/api/corbeille/tache/' + t + '/restaurer', {})).status, 200);
  assert.ok((await C.Mem.state()).tasks.some(x => x.id === t));
  // Purge d'un groupe : seulement vide
  await C.Resp.del('/api/tasks/' + t); await C.Resp.del('/api/groups/' + g);
  assert.equal((await admin.del('/api/corbeille/groupe/' + g)).status, 409, 'une tâche (même à la corbeille) l\'occupe encore');
  await admin.del('/api/corbeille/tache/' + t);
  assert.equal((await admin.del('/api/corbeille/groupe/' + g)).status, 200);
});

test('la catégorie d\'une tâche à la corbeille reste « utilisée » (pas de suppression qui orphelinerait)', async () => {
  const k = (await C.Mem.post('/api/categories', { label: 'Test corbeille', emoji: '🗑️' })).data.id;
  const id = await creer('Mem', { type: k });
  await C.Mem.del('/api/tasks/' + id);
  assert.equal((await admin.del('/api/categories/' + k)).status, 400);
});

test('entretien : la corbeille n\'est vidée qu\'après 90 jours, par la tâche planifiée', async () => {
  const vieux = await creer('Resp', { title: 'Très ancienne' });
  const recent = await creer('Resp', { title: 'Récente' });
  await C.Resp.del('/api/tasks/' + vieux); await C.Resp.del('/api/tasks/' + recent);
  srv.sql(`UPDATE tasks SET deleted_at = UTC_TIMESTAMP() - INTERVAL 91 DAY WHERE id = '${vieux}'`);
  const sim = srv.cli('entretien.php', ['--simulation']);
  assert.match(sim.stdout, /1 tâche\(s\) à purger/);
  assert.ok((await admin.get('/api/corbeille')).data.tasks.some(t => t.id === vieux), 'la simulation ne supprime rien');
  const r = srv.cli('entretien.php');
  assert.equal(r.status, 0, r.stderr);
  const ids = (await admin.get('/api/corbeille')).data.tasks.map(t => t.id);
  assert.ok(!ids.includes(vieux));
  assert.ok(ids.includes(recent));
});

test('suppression par clé d\'accès impossible, même de la corbeille', async () => {
  const k = (await C.Resp.post('/api/tokens', { name: 'k' })).data.token;
  const o = srv.client(); o.setBearer(k);
  const id = await creer('Resp', { title: 'Protégée' });
  assert.equal((await o.del('/api/tasks/' + id)).status, 403);
  await C.Resp.del('/api/tasks/' + id);
  assert.equal((await o.post('/api/corbeille/tache/' + id + '/restaurer', {})).status, 403);
});
