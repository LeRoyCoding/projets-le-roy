// Notifications utiles, retards et résumé quotidien.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, equipe, tache } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());
const notifs = async c => (await c.get('/api/notifications')).data;

test('tâche attribuée : la personne est prévenue, pas l\'auteur', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Devis Martin', ownerId: E.ids.c }))).data.id;
  const n = await notifs(E.claire);
  assert.equal(n.unread, 1);
  assert.equal(n.notifications[0].kind, 'assigned');
  assert.match(n.notifications[0].text, /Antoine vous a attribué « Devis Martin »/);
  assert.equal(n.notifications[0].taskId, id);
  assert.equal((await notifs(E.antoine)).unread, 0);
  assert.equal((await E.claire.state()).alertes.nonLues, 1);
  // Attribuer à soi-même : aucune notification ; changer de responsable : la nouvelle personne est prévenue
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Pour moi', ownerId: E.ids.a }));
  assert.equal((await notifs(E.antoine)).unread, 0);
  const t = (await E.antoine.state()).tasks.find(x => x.id === id);
  await E.claire.put('/api/tasks/' + id, { ...(await E.claire.state()).tasks.find(x => x.id === id), ownerId: E.ids.a });
  assert.equal((await notifs(E.antoine)).unread, 1, 'Claire lui réattribue la tâche');
});

test('commentaire : le responsable et le créateur sont prévenus, pas l\'auteur du commentaire', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'À commenter', ownerId: E.ids.c }))).data.id;
  await E.claire.patch('/api/notifications/lues', {}).catch(() => {});
  await E.claire.post('/api/notifications/lues', {});
  await E.claire.post('/api/tasks/' + id + '/comments', { body: 'Client rappelé, rendez-vous jeudi' });
  assert.equal((await notifs(E.claire)).unread, 0, 'l\'auteur n\'est pas notifié');
  const a = await notifs(E.antoine);
  assert.ok(a.notifications.some(x => x.kind === 'comment' && /Claire a commenté « À commenter » : Client rappelé/.test(x.text)));
});

test('tâche terminée : son créateur est prévenu', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'À finir', steps: [{ label: 'Seule étape' }], ownerId: E.ids.c }))).data.id;
  const t = (await E.claire.state()).tasks.find(x => x.id === id);
  await E.claire.patch('/api/steps/' + t.steps[0].id, { done: true });
  assert.ok((await notifs(E.antoine)).notifications.some(x => x.kind === 'done' && /« À finir » est terminée/.test(x.text)));
});

test('marquer comme lues : tout ou une sélection', async () => {
  const n = await notifs(E.antoine);
  assert.ok(n.unread >= 2);
  await E.antoine.post('/api/notifications/lues', { ids: [n.notifications[0].id] });
  assert.equal((await notifs(E.antoine)).unread, n.unread - 1);
  await E.antoine.post('/api/notifications/lues', {});
  assert.equal((await notifs(E.antoine)).unread, 0);
  assert.equal((await notifs(E.claire)).notifications.every(x => x.readAt !== undefined), true);
});

test('retards et échéances proches : calculés pour la personne (ses tâches et celles de « tout le groupe »)', async () => {
  const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'En retard', start: d(-20), end: d(-3), ownerId: E.ids.a }));
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Demain', start: d(-2), end: d(1), ownerId: E.ids.a }));
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Commune en retard', start: d(-20), end: d(-1), ownerId: null }));
  await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Loin', start: d(0), end: d(60), ownerId: E.ids.a }));
  const n = await notifs(E.antoine);
  assert.deepEqual(n.retard.map(x => x.title).sort(), ['Commune en retard', 'En retard']);
  assert.equal(n.retard.find(x => x.title === 'En retard').jours, 3);
  assert.ok(n.bientot.some(x => x.title === 'Demain' && x.jours === 1));
  assert.ok(!n.bientot.some(x => x.title === 'Loin'));
  const s = (await E.antoine.state()).alertes;
  assert.equal(s.retard, 2); assert.equal(s.bientot, n.bientot.length);
  const c = await notifs(E.claire);
  assert.deepEqual(c.retard.map(x => x.title), ['Commune en retard'], 'Claire ne voit que la tâche commune en retard');
});

test('préférences : adresse e-mail validée, résumé quotidien activable', async () => {
  assert.equal((await E.claire.put('/api/moi', { email: 'pas-un-mail' })).status, 400);
  assert.equal((await E.claire.put('/api/moi', { email: 'claire@example.org', notifyDaily: true })).status, 200);
  assert.deepEqual((await E.claire.state()).prefs, { email: 'claire@example.org', notifyDaily: true });
  await E.antoine.put('/api/moi', { email: 'antoine@example.org', notifyDaily: true });
});

test('résumé quotidien : retards, échéances proches, retards des groupes dont on est responsable ; rien si rien à dire', async () => {
  const r = srv.cli('notifier.php', ['--simulation'], { LR_TESTING: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--- Antoine <antoine@example\.org>/);
  assert.match(r.stdout, /EN RETARD \(2\)/);
  assert.match(r.stdout, /En retard — fin le \d\d\/\d\d\/\d{4} \(3 j de retard\)/);
  assert.match(r.stdout, /À FAIRE DANS LES 3 JOURS/);
  assert.match(r.stdout, /Demain/);
  assert.match(r.stdout, /Vous recevez ce résumé parce que vous l'avez demandé/);
  // Claire est responsable du groupe : elle voit aussi les retards des autres
  const c = r.stdout.split('--- Claire')[1] || '';
  assert.match(c, /TÂCHES EN RETARD DANS VOS GROUPES/);
  assert.match(c, /En retard — fin le/);
  // Une personne sans abonnement ne reçoit rien
  await E.antoine.put('/api/moi', { notifyDaily: false });
  assert.doesNotMatch(srv.cli('notifier.php', ['--simulation']).stdout, /--- Antoine/);
  assert.match(srv.cli('notifier.php', ['--simulation']).stdout, /1 abonné\(s\)/);
});

test('les notifications d\'une tâche purgée disparaissent avec elle', async () => {
  const id = (await E.antoine.post('/api/tasks', tache(E.ids.g, { title: 'Éphémère', ownerId: E.ids.c }))).data.id;
  assert.ok((await notifs(E.claire)).notifications.some(x => x.taskId === id));
  await E.antoine.del('/api/tasks/' + id);
  const admin = srv.client(); await admin.login('Administrateur', require('./aide').ADMIN_PW);
  assert.equal((await admin.del('/api/corbeille/tache/' + id)).status, 200);
  assert.ok(!(await notifs(E.claire)).notifications.some(x => x.taskId === id));
});

test('tableau de bord Direction : réservé à l\'administrateur, chiffres cohérents', async () => {
  assert.equal((await E.antoine.get('/api/direction')).status, 403);
  const admin = srv.client(); await admin.login('Administrateur', require('./aide').ADMIN_PW);
  const d = (await admin.get('/api/direction')).data;
  const st = (await admin.state());
  assert.equal(d.totaux.ouvertes, st.tasks.filter(t => !t.doneAt).length, 'cohérent avec l\'accueil');
  assert.ok(d.totaux.retard >= 2);
  const g = d.groupes.find(x => x.name === 'Le Roy');
  assert.equal(g.ouvertes, st.tasks.filter(t => t.groupId === g.id && !t.doneAt).length);
  assert.equal(g.retard, d.groupes.reduce((s, x) => s + x.retard, 0) - d.groupes.filter(x => x.id !== g.id).reduce((s, x) => s + x.retard, 0));
  assert.equal(d.semaines.length, 8);
  assert.ok(d.semaines[7].creees >= 5);
  assert.ok(d.personnes.every(p => p.ouvertes >= p.retard));
  assert.ok(d.personnes.some(p => p.name === 'Antoine' && p.retard >= 1));
});
