// Comptes : mot de passe, création d'utilisateurs (admin).
const bcrypt = require('bcryptjs');
const { fail, str, newId } = require('../outils');
const { GROUP_COLORS } = require('./groupes');

module.exports = function (app, { db, auth, adminOnly, handle }) {
  const checkPassword = (p, label = 'Le mot de passe') => {
    if (typeof p !== 'string' || p.length < 4) fail(400, `${label} doit faire au moins 4 caractères.`);
    if (p.length > 200) fail(400, `${label} est trop long.`);
    return p;
  };

  app.post('/api/password', auth, handle(req => {
    const { oldPassword, newPassword } = req.body || {};
    const row = db.prepare('SELECT password_hash, role FROM users WHERE id = ?').get(req.me.id);
    if (typeof oldPassword !== 'string' || !bcrypt.compareSync(oldPassword, row.password_hash)) fail(400, 'Le mot de passe actuel ne correspond pas.');
    checkPassword(newPassword, 'Le nouveau mot de passe');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.me.id);
    // Les autres appareils connectés à ce compte devront se reconnecter.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.me.id, req.me.sessionHash || '');
    if (row.role === 'admin') db.setSetting('default_admin_password', '0');
  }));

  app.post('/api/users', auth, adminOnly, handle(req => {
    const name = str(req.body.name, 60, 'Le nom', true);
    const password = checkPassword(req.body.password);
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
        db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(gid, id);
      }
    });
    return { id };
  }, { notify: true }));
};
