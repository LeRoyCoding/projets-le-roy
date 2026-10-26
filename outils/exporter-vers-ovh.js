// Exporte les données de l'ancienne version (fichier SQLite sur le PC du bureau) vers un fichier SQL
// à importer dans la base MySQL d'OVHcloud (phpMyAdmin). Ne modifie jamais la base d'origine.
// Utilisation : exporter-vers-ovh.bat  (ou : node outils/exporter-vers-ovh.js [chemin\projets.sqlite])
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const racine = path.join(__dirname, '..');
const source = process.argv[2] || path.join(racine, 'donnees', 'projets.sqlite');
const sortie = path.join(racine, 'export-ovh.sql');

if (!fs.existsSync(source)) {
  console.error(`\n  Base de données introuvable : ${source}\n  Indiquez son chemin : exporter-vers-ovh.bat "C:\\ProjetsLeRoy\\donnees\\projets.sqlite"\n`);
  process.exit(1);
}
const db = new DatabaseSync(source, { readOnly: true });
const version = db.prepare('PRAGMA user_version').get().user_version;
if (version < 8) {
  console.error(`\n  Cette base date d'une version trop ancienne (schéma ${version}, il faut 8).\n  Lancez d'abord l'ancienne application une fois avec sa dernière mise à jour, puis recommencez.\n`);
  process.exit(1);
}

// Tables et colonnes exportées (même noms dans MySQL). L'ordre respecte les liens entre tables.
const TABLES = [
  ['users', ['id', 'name', 'password_hash', 'role', 'active', 'created_at']],
  ['groupes', ['id', 'name', 'icon', 'color', 'position', 'created_at']],
  ['group_members', ['group_id', 'user_id']],
  ['categories', ['id', 'label', 'emoji', 'position', 'hidden', 'created_by', 'created_at']],
  ['tasks', ['id', 'group_id', 'owner_id', 'type', 'title', 'description', 'start_date', 'end_date', 'created_by', 'completed', 'done_at', 'done_by', 'priority', 'created_at', 'updated_at']],
  ['steps', ['id', 'task_id', 'position', 'label', 'description', 'done', 'done_at', 'done_by']],
  ['comments', ['id', 'task_id', 'user_id', 'body', 'created_at']],
  ['activity', ['id', 'task_id', 'user_id', 'action', 'detail', 'created_at']]
  // Les anciennes clés d'accès ne sont PAS reprises : le nouveau format est plus sûr (portée, expiration). Chacun en recrée une.
];

const q = v => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";
};

const out = [`-- Export Projets Le Roy du ${new Date().toLocaleString('fr-FR')}`, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;'];
const resume = [];
// Aucune suppression : ce fichier ne fait qu'AJOUTER des lignes (jamais de vidage de la base). À importer dans une base neuve.
for (const [table, cols] of TABLES) {
  const order = table === 'steps' || table === 'comments' ? ' ORDER BY rowid' : '';
  const rows = db.prepare(`SELECT ${cols.map(c => `"${c}"`).join(', ')} FROM ${table}${order}`).all();
  for (const r of rows) out.push(`INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(c => q(r[c])).join(', ')});`);
  resume.push(`${String(rows.length).padStart(5)}  ${table}`);
}
// Sécurité : tous les comptes repris devront choisir un nouveau mot de passe (12 caractères minimum) à leur première connexion.
// Les responsables des groupes sont désignés par l'application (premier membre, ou l'administrateur) lors de la migration suivante.
out.push("UPDATE `users` SET must_change = 1;", 'SET FOREIGN_KEY_CHECKS=1;');
fs.writeFileSync(sortie, out.join('\n') + '\n', 'utf8');

console.log('\n  Export terminé. Lignes exportées :');
console.log(resume.map(l => '   ' + l).join('\n'));
console.log(`\n  Fichier à importer dans phpMyAdmin : ${sortie}\n`);
