// Toutes les données visibles par la personne connectée, en une seule fois.
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

    // Nombre total de tâches au nom de chacun (page Compte de l'admin)
    const taskCounts = admin
      ? Object.fromEntries(db.prepare('SELECT owner_id, COUNT(*) AS n FROM tasks WHERE owner_id IS NOT NULL GROUP BY owner_id').all().map(r => [r.owner_id, r.n]))
      : {};

    return {
      me: me.id,
      users,
      groups,
      taskCounts,
      defaultAdminPassword: admin && db.getSetting('default_admin_password') === '1',
      tasks: tasks.map(t => ({
        id: t.id, groupId: t.group_id, ownerId: t.owner_id, type: t.type, title: t.title, desc: t.description,
        start: t.start_date, end: t.end_date, steps: stepsByTask[t.id] || []
      }))
    };
  }));
};
