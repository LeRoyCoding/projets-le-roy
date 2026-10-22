const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { open, MIGRATIONS } = require('../server/db');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projets-db-'));

test('une ancienne base est mise à jour sans perte, avec une copie de sécurité avant', () => {
  const dir = tmp(), file = path.join(dir, 'p.sqlite'), backups = path.join(dir, 'sauvegardes');
  // Base telle que créée par la toute première version (schéma 1), avec une tâche de type « devis ».
  const old = new DatabaseSync(file);
  old.exec(MIGRATIONS[0]);
  old.exec(`PRAGMA user_version = 1;
    INSERT INTO users (id, name, password_hash, role) VALUES ('u1', 'Antoine', 'x', 'user');
    INSERT INTO groupes (id, name, icon, color) VALUES ('g1', 'Le Roy', 'img:lr', '#C4122F');
    INSERT INTO tasks (id, group_id, owner_id, type, title, start_date, end_date) VALUES ('t1', 'g1', 'u1', 'devis', 'Ancienne', '2026-01-01', '2026-02-01');
    INSERT INTO tasks (id, group_id, owner_id, type, title, start_date, end_date) VALUES ('t2', 'g1', 'u1', 'bizarre', 'Type inconnu', '2026-01-01', '2026-02-01');`);
  old.close();

  const db = open(file, { backupDir: backups });
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
  assert.equal(db.prepare('SELECT title FROM tasks WHERE id = ?').get('t1').title, 'Ancienne');
  assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get('u1').active, 1);
  // Un type inconnu devient une catégorie pour ne pas perdre l'information
  assert.ok(db.prepare("SELECT 1 FROM categories WHERE id = 'bizarre'").get());
  db.close();
  const copies = fs.readdirSync(backups);
  assert.equal(copies.length, 1);
  assert.match(copies[0], /^avant-mise-a-jour-.*-schema1\.sqlite$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('une base plus récente que l\'application est refusée', () => {
  const dir = tmp(), file = path.join(dir, 'p.sqlite');
  const d = new DatabaseSync(file); d.exec(`PRAGMA user_version = ${MIGRATIONS.length + 5}`); d.close();
  assert.throws(() => open(file), /plus récente/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('nouvelle base : un administrateur par défaut', () => {
  const dir = tmp();
  const db = open(path.join(dir, 'p.sqlite'), { backupDir: path.join(dir, 's') });
  assert.equal(db.prepare("SELECT name FROM users WHERE role = 'admin'").get().name, 'Administrateur');
  assert.equal(db.getSetting('default_admin_password'), '1');
  assert.ok(!fs.existsSync(path.join(dir, 's')), 'pas de copie pour une base neuve');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
