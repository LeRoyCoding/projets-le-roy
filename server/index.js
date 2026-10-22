// Serveur « Projets Le Roy » : sert l'application et enregistre les données dans SQLite.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { open, newId, startDailyBackup, ROOT } = require('./db');

const DEMO = process.argv.includes('--demo');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(ROOT, 'donnees');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, DEMO ? 'demo.sqlite' : 'projets.sqlite');
const BACKUP_DIR = path.join(ROOT, 'sauvegardes');
const COOKIE = 'lr_session';
const SESSION_DAYS = 60;

const TYPES = ['devis', 'chantier', 'commercial', 'dev', 'admin', 'prod', 'event', 'perso'];
const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];

const db = open(DB_FILE);
if (DEMO) require('./demo').seed(db);
if (!DEMO) startDailyBackup(db, BACKUP_DIR);

/* ---------- Outils ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const str = (v, max, label, required = false) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(400, `${label} est obligatoire.`);
  if (s.length > max) fail(400, `${label} est trop long (${max} caractères maximum).`);
  return s;
};
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

const getUser = id => db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(id);
const getGroup = id => db.prepare('SELECT * FROM groupes WHERE id = ?').get(id);
const membersOf = gid => db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(gid).map(r => r.user_id);
const getTask = id => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
const isMember = (gid, uid) => !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, uid);
const canEditTask = (me, t) => me.role === 'admin' || t.owner_id === me.id || isMember(t.group_id, me.id);

/* ---------- Temps réel (Server-Sent Events) ---------- */
const listeners = new Set();
function broadcast() {
  for (const res of listeners) res.write('event: change\ndata: {}\n\n');
}
setInterval(() => { for (const res of listeners) res.write(': ping\n\n'); }, 25000).unref();

/* ---------- Application ---------- */
const app = express();
app.disable('x-powered-by');

// Réseau local uniquement : on refuse toute connexion qui ne vient pas d'une adresse privée.
function isLocalAddress(ip = '') {
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return /^(fc|fd|fe80)/i.test(ip);
}
app.use((req, res, next) => {
  if (!isLocalAddress(req.socket.remoteAddress)) return res.status(403).send('Accès réservé au réseau local.');
  next();
});

app.use(express.json({ limit: '1mb' }));

// Protection simple : les modifications doivent arriver en JSON depuis l'application.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ error: 'Requête refusée.' });
  next();
});

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.name, u.role, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.last_seen > datetime('now', '-${SESSION_DAYS} days')`).get(token);
  if (!row) return null;
  db.prepare("UPDATE sessions SET last_seen = datetime('now') WHERE token = ? AND last_seen < datetime('now', '-1 hour')").run(token);
  return { id: row.id, name: row.name, role: row.role, token };
}

const auth = (req, res, next) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
  req.me = me;
  next();
};
const adminOnly = (req, res, next) => (req.me.role === 'admin' ? next() : res.status(403).json({ error: 'Réservé à l\'administrateur.' }));

// Enveloppe : capture les erreurs et prévient les autres postes après une modification.
const handle = (fn, { notify = false } = {}) => (req, res) => {
  try {
    const out = fn(req, res);
    if (notify) broadcast();
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Erreur inattendue du serveur.' });
  }
};

/* ---------- Connexion ---------- */
app.get('/api/comptes', handle(() => ({
  users: db.prepare("SELECT id, name, role FROM users ORDER BY role = 'admin' DESC, name").all(),
  defaultAdminPassword: db.getSetting('default_admin_password') === '1',
  demo: DEMO
})));

const failures = new Map(); // limite les essais de mot de passe
app.post('/api/login', handle((req, res) => {
  const { userId, password } = req.body || {};
  const f = failures.get(userId);
  if (f && f.count >= 5 && Date.now() - f.last < 60000) fail(429, 'Trop d\'essais. Patientez une minute.');
  const row = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(String(userId || ''));
  if (!row || typeof password !== 'string' || !bcrypt.compareSync(password, row.password_hash)) {
    failures.set(userId, { count: (f && Date.now() - f.last < 60000 ? f.count : 0) + 1, last: Date.now() });
    fail(401, 'Mot de passe incorrect.');
  }
  failures.delete(userId);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, row.id);
  db.prepare("DELETE FROM sessions WHERE last_seen < datetime('now', ?)").run(`-${SESSION_DAYS} days`);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  return { ok: true };
}));

app.post('/api/logout', handle((req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return { ok: true };
}));

/* ---------- Données visibles par la personne connectée ---------- */
app.get('/api/state', auth, handle(req => {
  const me = req.me;
  const users = db.prepare("SELECT id, name, role FROM users ORDER BY role = 'admin' DESC, created_at, name").all();
  const allMembers = db.prepare('SELECT group_id, user_id FROM group_members').all();
  const membersByGroup = {};
  for (const r of allMembers) (membersByGroup[r.group_id] ||= []).push(r.user_id);

  let tasks;
  if (me.role === 'admin') tasks = db.prepare('SELECT * FROM tasks ORDER BY end_date').all();
  else tasks = db.prepare(`SELECT * FROM tasks WHERE owner_id = ?
      OR group_id IN (SELECT group_id FROM group_members WHERE user_id = ?) ORDER BY end_date`).all(me.id, me.id);

  const taskGroupIds = new Set(tasks.map(t => t.group_id));
  const groups = db.prepare('SELECT * FROM groupes ORDER BY created_at, name').all()
    .filter(g => me.role === 'admin' || (membersByGroup[g.id] || []).includes(me.id) || taskGroupIds.has(g.id))
    .map(g => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, members: membersByGroup[g.id] || [] }));

  const stepsByTask = {};
  if (tasks.length) {
    const ids = tasks.map(t => t.id);
    const rows = db.prepare(`SELECT * FROM steps WHERE task_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, rowid`).all(...ids);
    for (const s of rows) (stepsByTask[s.task_id] ||= []).push({ id: s.id, label: s.label, desc: s.description, done: !!s.done });
  }

  // Nombre total de tâches au nom de chacun (pour la page Compte de l'admin)
  const taskCounts = me.role === 'admin'
    ? Object.fromEntries(db.prepare('SELECT owner_id, COUNT(*) AS n FROM tasks WHERE owner_id IS NOT NULL GROUP BY owner_id').all().map(r => [r.owner_id, r.n]))
    : {};

  return {
    me: me.id,
    users,
    groups,
    taskCounts,
    defaultAdminPassword: me.role === 'admin' && db.getSetting('default_admin_password') === '1',
    tasks: tasks.map(t => ({
      id: t.id, groupId: t.group_id, ownerId: t.owner_id, type: t.type, title: t.title, desc: t.description,
      start: t.start_date, end: t.end_date, steps: stepsByTask[t.id] || []
    }))
  };
}));

app.get('/api/events', auth, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
});

/* ---------- Tâches ---------- */
function readTask(me, body, existing = null) {
  const b = body || {};
  const title = str(b.title, 200, 'Le titre', true);
  const desc = str(b.desc, 5000, 'La description');
  const type = TYPES.includes(b.type) ? b.type : 'devis';
  if (!isDate(b.start) || !isDate(b.end)) fail(400, 'Renseignez les dates de début et de fin.');
  if (b.end < b.start) fail(400, 'La date de fin doit être après la date de début.');
  const g = getGroup(String(b.groupId || ''));
  if (!g) fail(400, 'Choisissez un groupe.');
  const members = membersOf(g.id);
  // Une personne qui n'est pas du groupe peut quand même modifier une tâche qui lui est attribuée (sans la déplacer).
  const keepsOwnTask = existing && existing.group_id === g.id && existing.owner_id === me.id;
  if (me.role !== 'admin' && !members.includes(me.id) && !keepsOwnTask) fail(403, 'Vous ne faites pas partie de ce groupe.');
  let ownerId = b.ownerId ? String(b.ownerId) : null;
  if (ownerId && !getUser(ownerId)) fail(400, 'Personne inconnue.');
  if (ownerId && !members.includes(ownerId) && ownerId !== me.id) fail(400, 'Cette personne ne fait pas partie du groupe.');
  if (!ownerId && members.length < 2) ownerId = members[0] || me.id; // groupe privé : la tâche est à son unique membre
  const steps = Array.isArray(b.steps) ? b.steps.slice(0, 200).map(s => ({
    id: s && typeof s.id === 'string' ? s.id : null,
    label: str(s && s.label, 300, 'Le nom d\'une étape'),
    desc: str(s && s.desc, 2000, 'La description d\'une étape'),
    done: !!(s && s.done)
  })).filter(s => s.label) : [];
  return { title, desc, type, start: b.start, end: b.end, groupId: g.id, ownerId, steps };
}

function writeSteps(taskId, steps) {
  const existing = new Set(db.prepare('SELECT id FROM steps WHERE task_id = ?').all(taskId).map(r => r.id));
  const keep = new Set();
  steps.forEach((s, i) => {
    if (s.id && existing.has(s.id)) {
      db.prepare('UPDATE steps SET position = ?, label = ?, description = ?, done = ? WHERE id = ?').run(i, s.label, s.desc, s.done ? 1 : 0, s.id);
      keep.add(s.id);
    } else {
      db.prepare('INSERT INTO steps (id, task_id, position, label, description, done) VALUES (?, ?, ?, ?, ?, ?)').run(newId(), taskId, i, s.label, s.desc, s.done ? 1 : 0);
    }
  });
  for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM steps WHERE id = ?').run(id);
}

const touch = taskId => db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);

app.post('/api/tasks', auth, handle(req => {
  const d = readTask(req.me, req.body);
  const id = newId();
  db.tx(() => {
    db.prepare(`INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, req.me.id);
    writeSteps(id, d.steps);
  });
  return { id };
}, { notify: true }));

function editableTask(me, id) {
  const t = getTask(id);
  if (!t) fail(404, 'Cette tâche n\'existe plus.');
  if (!canEditTask(me, t)) fail(403, 'Vous ne pouvez pas modifier cette tâche.');
  return t;
}

app.put('/api/tasks/:id', auth, handle(req => {
  const t = editableTask(req.me, req.params.id);
  const d = readTask(req.me, req.body, t);
  db.tx(() => {
    db.prepare(`UPDATE tasks SET group_id = ?, owner_id = ?, type = ?, title = ?, description = ?, start_date = ?, end_date = ?,
      updated_at = datetime('now') WHERE id = ?`).run(d.groupId, d.ownerId, d.type, d.title, d.desc, d.start, d.end, t.id);
    writeSteps(t.id, d.steps);
  });
}, { notify: true }));

app.delete('/api/tasks/:id', auth, handle(req => {
  const t = editableTask(req.me, req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
}, { notify: true }));

/* ---------- Étapes ---------- */
app.post('/api/tasks/:id/steps', auth, handle(req => {
  const t = editableTask(req.me, req.params.id);
  const label = str(req.body.label, 300, 'Le nom de l\'étape', true);
  const desc = str(req.body.desc, 2000, 'La description');
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM steps WHERE task_id = ?').get(t.id).p;
  const id = newId();
  db.prepare('INSERT INTO steps (id, task_id, position, label, description) VALUES (?, ?, ?, ?, ?)').run(id, t.id, pos, label, desc);
  touch(t.id);
  return { id };
}, { notify: true }));

function editableStep(me, id) {
  const s = db.prepare('SELECT * FROM steps WHERE id = ?').get(id);
  if (!s) fail(404, 'Cette étape n\'existe plus.');
  editableTask(me, s.task_id);
  return s;
}

app.patch('/api/steps/:id', auth, handle(req => {
  const s = editableStep(req.me, req.params.id);
  db.prepare('UPDATE steps SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, s.id);
  touch(s.task_id);
}, { notify: true }));

app.delete('/api/steps/:id', auth, handle(req => {
  const s = editableStep(req.me, req.params.id);
  db.prepare('DELETE FROM steps WHERE id = ?').run(s.id);
  touch(s.task_id);
}, { notify: true }));

/* ---------- Groupes ---------- */
function readGroup(me, body) {
  const b = body || {};
  const name = str(b.name, 80, 'Le nom du groupe', true);
  let icon = str(b.icon, 20, 'Le logo') || '📁';
  if (icon.startsWith('img:') && !['img:lr', 'img:llc'].includes(icon)) icon = '📁';
  const color = /^#[0-9A-Fa-f]{6}$/.test(b.color || '') ? b.color : GROUP_COLORS[2];
  let members = Array.isArray(b.members) ? [...new Set(b.members.map(String))].filter(id => getUser(id)) : [];
  if (me.role !== 'admin' && !members.includes(me.id)) members.unshift(me.id);
  if (!members.length) fail(400, 'Choisissez au moins une personne pour ce groupe.');
  return { name, icon, color, members };
}
function setMembers(gid, members) {
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(gid);
  for (const uid of members) db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(gid, uid);
}
function editableGroup(me, id) {
  const g = getGroup(id);
  if (!g) fail(404, 'Ce groupe n\'existe plus.');
  if (me.role !== 'admin' && !isMember(g.id, me.id)) fail(403, 'Vous ne faites pas partie de ce groupe.');
  return g;
}

app.post('/api/groups', auth, handle(req => {
  const d = readGroup(req.me, req.body);
  const id = newId();
  db.tx(() => {
    db.prepare('INSERT INTO groupes (id, name, icon, color) VALUES (?, ?, ?, ?)').run(id, d.name, d.icon, d.color);
    setMembers(id, d.members);
  });
  return { id };
}, { notify: true }));

app.put('/api/groups/:id', auth, handle(req => {
  const g = editableGroup(req.me, req.params.id);
  const d = readGroup(req.me, req.body);
  db.tx(() => {
    db.prepare('UPDATE groupes SET name = ?, icon = ?, color = ? WHERE id = ?').run(d.name, d.icon, d.color, g.id);
    setMembers(g.id, d.members);
  });
}, { notify: true }));

app.delete('/api/groups/:id', auth, handle(req => {
  const g = editableGroup(req.me, req.params.id);
  if (db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE group_id = ?').get(g.id).n) fail(400, 'Ce groupe contient encore des tâches.');
  db.prepare('DELETE FROM groupes WHERE id = ?').run(g.id);
}, { notify: true }));

/* ---------- Comptes ---------- */
app.post('/api/password', auth, handle(req => {
  const { oldPassword, newPassword } = req.body || {};
  const row = db.prepare('SELECT password_hash, role FROM users WHERE id = ?').get(req.me.id);
  if (typeof oldPassword !== 'string' || !bcrypt.compareSync(oldPassword, row.password_hash)) fail(400, 'Le mot de passe actuel ne correspond pas.');
  if (typeof newPassword !== 'string' || newPassword.length < 4) fail(400, 'Le nouveau mot de passe doit faire au moins 4 caractères.');
  if (newPassword.length > 200) fail(400, 'Le nouveau mot de passe est trop long.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.me.id);
  // Les autres appareils connectés à ce compte devront se reconnecter.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.me.id, req.me.token);
  if (row.role === 'admin') db.setSetting('default_admin_password', '0');
}));

app.post('/api/users', auth, adminOnly, handle(req => {
  const name = str(req.body.name, 60, 'Le nom', true);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 4) fail(400, 'Le mot de passe doit faire au moins 4 caractères.');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) fail(400, 'Ce nom est déjà utilisé.');
  const id = newId();
  db.tx(() => {
    db.prepare('INSERT INTO users (id, name, password_hash, role) VALUES (?, ?, ?, ?)').run(id, name, bcrypt.hashSync(password, 10), role);
    if (role === 'user') {
      // Chaque utilisateur reçoit son groupe privé « Perso ».
      const n = db.prepare('SELECT COUNT(*) AS n FROM groupes').get().n;
      const gid = newId();
      db.prepare('INSERT INTO groupes (id, name, icon, color) VALUES (?, ?, ?, ?)').run(gid, 'Perso', '🏡', GROUP_COLORS[2 + (n % 4)]);
      setMembers(gid, [id]);
    }
  });
  return { id };
}, { notify: true }));

/* ---------- Fichiers de l'application ---------- */
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res, file) {
    if (/\.(html|js|css|webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Adresse inconnue.' }));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

/* ---------- Démarrage ---------- */
function localAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const pidFile = path.join(DATA_DIR, 'serveur.pid');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(pidFile, String(process.pid)); } catch { /* sans importance */ }
  const cleanup = () => { try { fs.unlinkSync(pidFile); } catch { /* déjà supprimé */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const ips = localAddresses();
  console.log('');
  console.log('  ==============================================');
  console.log('   Projets Le Roy est démarré' + (DEMO ? ' (MODE DÉMO, données d\'exemple)' : ''));
  console.log('  ==============================================');
  console.log(`   Sur ce PC        : http://localhost:${PORT}`);
  for (const ip of ips) console.log(`   Pour les collègues : http://${ip}:${PORT}`);
  console.log('');
  console.log('   Laissez cette fenêtre ouverte (vous pouvez la réduire).');
  console.log(`   Base de données : ${DB_FILE}`);
  console.log('');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Le port ${PORT} est déjà utilisé : le serveur est sans doute déjà lancé.\n`);
  else console.error(e);
  process.exit(1);
});
