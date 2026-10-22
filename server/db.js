// Base de données SQLite (module intégré à Node.js : rien à compiler sous Windows).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { newId, todayIso } = require('./outils');

const ROOT = path.join(__dirname, '..');

// Chaque migration ne s'exécute qu'une fois ; on n'en modifie jamais une déjà publiée,
// on en ajoute une nouvelle à la suite. Les données existantes sont ainsi conservées.
const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin','user')),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE groupes (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     icon TEXT NOT NULL,
     color TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE group_members (
     group_id TEXT NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     PRIMARY KEY (group_id, user_id)
   );
   CREATE TABLE tasks (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL REFERENCES groupes(id),
     owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     type TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     start_date TEXT NOT NULL,
     end_date TEXT NOT NULL,
     created_by TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX tasks_group ON tasks(group_id);
   CREATE INDEX tasks_owner ON tasks(owner_id);
   CREATE TABLE steps (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     position INTEGER NOT NULL DEFAULT 0,
     label TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     done INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX steps_task ON steps(task_id);
   CREATE TABLE sessions (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     last_seen TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);`,

  // 2 — les jetons de session sont désormais stockés hachés : tout le monde se reconnecte une fois.
  `DELETE FROM sessions;`,

  // 3 — comptes désactivables (le compte reste dans l'historique mais ne peut plus se connecter)
  `ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;`,

  // 4 — catégories personnalisables (remplacent les 8 types fixes, avec les mêmes identifiants)
  `CREATE TABLE categories (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     emoji TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0,
     hidden INTEGER NOT NULL DEFAULT 0,
     created_by TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   INSERT INTO categories (id, label, emoji, position) VALUES
     ('devis', 'Devis', '🧾', 0),
     ('chantier', 'Chantier', '🏗️', 1),
     ('commercial', 'Commercial', '🤝', 2),
     ('dev', 'Développement', '💻', 3),
     ('admin', 'Administratif', '📋', 4),
     ('prod', 'Production', '⚙️', 5),
     ('event', 'Salon / évènement', '🎪', 6),
     ('perso', 'Perso', '🏡', 7);
   INSERT INTO categories (id, label, emoji, position)
     SELECT DISTINCT type, type, '📁', 100 FROM tasks WHERE type NOT IN (SELECT id FROM categories);`,

  // 5 — tâches sans étapes « terminées » à la main, commentaires et historique
  `ALTER TABLE tasks ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE comments (
     id TEXT PRIMARY KEY,
     task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX comments_task ON comments(task_id);
   CREATE TABLE activity (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     action TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX activity_task ON activity(task_id);`,

  // 6 — clés d'accès pour les outils externes (lien avec Claude)
  `CREATE TABLE api_tokens (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     last_used TEXT
   );`
];

// backupDir : si la base doit être mise à jour, une copie de sécurité y est faite avant.
function open(file, { backupDir = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  db.tx = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > MIGRATIONS.length) {
    db.close(); // libère le fichier (sous Windows, un fichier ouvert reste verrouillé)
    throw new Error(`Cette base de données vient d'une version plus récente de l'application (schéma ${version}). Lancez mettre-a-jour.bat.`);
  }
  if (version > 0 && version < MIGRATIONS.length && backupDir) {
    // Copie de sécurité avant de transformer une base existante.
    fs.mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, `avant-mise-a-jour-${todayIso()}-schema${version}.sqlite`);
    if (!fs.existsSync(target)) db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }

  db.hasTable = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  db.getSetting = key => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  db.setSetting = (key, value) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  // Premier démarrage : un compte administrateur avec un mot de passe à changer.
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    db.prepare('INSERT INTO users (id, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(newId(), 'Administrateur', bcrypt.hashSync('admin', 10), 'admin');
    db.setSetting('default_admin_password', '1');
  }
  return db;
}

// Sauvegarde quotidienne : une copie par jour dans sauvegardes/, on garde les 60 dernières.
function startDailyBackup(db, dir, keep = 60) {
  const run = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const day = todayIso();
      const target = path.join(dir, `projets-${day}.sqlite`);
      if (!fs.existsSync(target)) {
        db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
        console.log(`Sauvegarde du jour enregistrée : ${target}`);
      }
      const files = fs.readdirSync(dir).filter(f => /^projets-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
      files.slice(0, Math.max(0, files.length - keep)).forEach(f => fs.unlinkSync(path.join(dir, f)));
    } catch (e) {
      console.error('Sauvegarde impossible :', e.message);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = { open, newId, startDailyBackup, ROOT, MIGRATIONS };
