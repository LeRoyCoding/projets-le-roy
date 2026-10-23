// Groupes (communs ou privés).
const { fail, str, newId } = require('../outils');

const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];

module.exports = function (app, { db, auth, adminOnly, handle, q }) {
  function readGroup(me, body) {
    const b = body || {};
    const name = str(b.name, 80, 'Le nom du groupe', true);
    let icon = str(b.icon, 20, 'Le logo') || '📁';
    if (icon.startsWith('img:') && !['img:lr', 'img:llc'].includes(icon)) icon = '📁';
    const color = /^#[0-9A-Fa-f]{6}$/.test(b.color || '') ? b.color : GROUP_COLORS[2];
    const members = Array.isArray(b.members) ? [...new Set(b.members.map(String))].filter(id => q.getUser(id)) : [];
    if (me.role !== 'admin' && !members.includes(me.id)) members.unshift(me.id);
    if (!members.length) fail(400, 'Choisissez au moins une personne pour ce groupe.');
    return { name, icon, color, members };
  }
  function setMembers(gid, members) {
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(gid);
    for (const uid of members) db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(gid, uid);
  }

  app.post('/api/groups', auth, handle(req => {
    const d = readGroup(req.me, req.body);
    const id = newId();
    db.tx(() => {
      const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM groupes').get().p;
      db.prepare('INSERT INTO groupes (id, name, icon, color, position) VALUES (?, ?, ?, ?, ?)').run(id, d.name, d.icon, d.color, pos);
      setMembers(id, d.members);
    });
    return { id };
  }, { notify: true }));

  app.put('/api/groups/:id', auth, handle(req => {
    const g = q.editableGroup(req.me, req.params.id);
    const d = readGroup(req.me, req.body);
    db.tx(() => {
      db.prepare('UPDATE groupes SET name = ?, icon = ?, color = ? WHERE id = ?').run(d.name, d.icon, d.color, g.id);
      setMembers(g.id, d.members);
    });
  }, { notify: true }));

  // Ordre d'affichage des groupes (accueil, timeline, listes) : réglé par l'administrateur pour tout le monde.
  app.post('/api/groups/ordre', auth, adminOnly, handle(req => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : fail(400, 'Ordre illisible.');
    db.tx(() => ids.forEach((id, i) => db.prepare('UPDATE groupes SET position = ? WHERE id = ?').run(i + 1, id)));
  }, { notify: true }));

  app.delete('/api/groups/:id', auth, handle(req => {
    const g = q.editableGroup(req.me, req.params.id);
    if (db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE group_id = ?').get(g.id).n) fail(400, 'Ce groupe contient encore des tâches.');
    db.prepare('DELETE FROM groupes WHERE id = ?').run(g.id);
  }, { notify: true }));

};
module.exports.GROUP_COLORS = GROUP_COLORS;
