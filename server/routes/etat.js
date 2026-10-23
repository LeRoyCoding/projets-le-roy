// Toutes les données visibles par la personne connectée, en une seule fois.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('../db');

// Version affichée dans la page Compte : numéro du package + commit Git s'il est connu.
function version() {
  let v = require('../../package.json').version;
  try {
    let head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) head = fs.readFileSync(path.join(ROOT, '.git', head.slice(5)), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) v += ' (' + head.slice(0, 7) + ')';
  } catch { /* installation sans Git */ }
  return v;
}
const VERSION = version();

module.exports = function (app, { db, auth, handle }) {
  app.get('/api/state', auth, handle(req => {
    const me = req.me;
    const admin = me.role === 'admin';
    const users = db.prepare("SELECT id, name, role, active FROM users ORDER BY role = 'admin' DESC, created_at, name").all()
      .map(u => ({ id: u.id, name: u.name, role: u.role, active: !!u.active }));
    const membersByGroup = {};
    for (const r of db.prepare('SELECT group_id, user_id FROM group_members').all()) (membersByGroup[r.group_id] ||= []).push(r.user_id);

    const tasks = admin
      ? db.prepare('SELECT * FROM tasks ORDER BY end_date').all()
      : db.prepare(`SELECT * FROM tasks WHERE owner_id = ?
          OR group_id IN (SELECT group_id FROM group_members WHERE user_id = ?) ORDER BY end_date`).all(me.id, me.id);

    const taskGroupIds = new Set(tasks.map(t => t.group_id));
    const groups = db.prepare('SELECT * FROM groupes ORDER BY created_at, name').all()
      .filter(g => admin || (membersByGroup[g.id] || []).includes(me.id) || taskGroupIds.has(g.id))
      .map(g => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, members: membersByGroup[g.id] || [] }));

    const stepsByTask = {};
    if (tasks.length) {
      const ids = tasks.map(t => t.id);
      const ph = ids.map(() => '?').join(',');
      for (const s of db.prepare(`SELECT * FROM steps WHERE task_id IN (${ph}) ORDER BY position, rowid`).all(...ids)) {
        (stepsByTask[s.task_id] ||= []).push({ id: s.id, label: s.label, desc: s.description, done: !!s.done });
      }
    }

    const commentCounts = {};
    if (tasks.length) {
      const ids = tasks.map(t => t.id);
      for (const r of db.prepare(`SELECT task_id, COUNT(*) AS n FROM comments WHERE task_id IN (${ids.map(() => '?').join(',')}) GROUP BY task_id`).all(...ids)) commentCounts[r.task_id] = r.n;
    }
    const usage = Object.fromEntries(db.prepare('SELECT type, COUNT(*) AS n FROM tasks GROUP BY type').all().map(r => [r.type, r.n]));
    const categories = db.prepare('SELECT id, label, emoji, hidden FROM categories ORDER BY position, label').all()
      .map(c => ({ id: c.id, label: c.label, emoji: c.emoji, hidden: !!c.hidden, count: usage[c.id] || 0 }));

    // Nombre total de tâches au nom de chacun (page Compte de l'admin)
    const taskCounts = admin
      ? Object.fromEntries(db.prepare('SELECT owner_id, COUNT(*) AS n FROM tasks WHERE owner_id IS NOT NULL GROUP BY owner_id').all().map(r => [r.owner_id, r.n]))
      : {};

    // Adresses de l'application sur le réseau (pour configurer Claude depuis un autre PC).
    const port = req.socket.localPort;
    const lanUrls = Object.values(os.networkInterfaces()).flat()
      .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${port}`);

    return {
      me: me.id,
      version: VERSION,
      lanUrls,
      users,
      groups,
      categories,
      taskCounts,
      defaultAdminPassword: admin && db.getSetting('default_admin_password') === '1',
      connecteur: { actif: db.getSetting('connecteur_internet') === '1', port: app.locals.connecteur?.port || Number(process.env.MCP_PORT) || 3001 },
      tasks: tasks.map(t => ({
        id: t.id, groupId: t.group_id, ownerId: t.owner_id, type: t.type, title: t.title, desc: t.description,
        start: t.start_date, end: t.end_date, completed: !!t.completed, comments: commentCounts[t.id] || 0,
        createdAt: t.created_at, updatedAt: t.updated_at, steps: stepsByTask[t.id] || []
      }))
    };
  }));
};
