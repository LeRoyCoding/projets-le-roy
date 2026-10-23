// Données reçues du serveur et règles métier (statuts, visibilité, filtres).
'use strict';

let S = null;      // données de la personne connectée (null = pas connecté)
let L = null;      // comptes affichés sur l'écran de connexion
const ui = {
  view: 'home', loginUser: null, loginErr: '',
  filter: [],                                  // admin : personnes sélectionnées
  search: '', cat: '',                         // recherche et catégorie
  statusFilter: null,                          // compteur cliqué : 'open' | 'soon' | 'late'
  hideDone: pref.get('hideDone', false),       // masquer les tâches terminées
  onlyMine: pref.get('onlyMine', false),       // utilisateur : seulement mes tâches
  tlGroup: 'all',
  editId: null, dupFrom: null, editGroup: null, presetGroup: null,
  openTask: null, confirmDel: false, details: null,
  editUser: null, editCat: null, catDel: null, newKey: null, keys: [], historyOpen: false,
  hist: null, histQ: '',
  pwdErr: '', busy: false
};

async function loadLogin() {
  try { L = await api('GET', '/api/comptes'); } catch (e) { L = { users: [], error: e.message }; }
}
async function refresh() {
  S = await api('GET', '/api/state');
  if (ui.openTask && !S.tasks.some(t => t.id === ui.openTask)) { ui.openTask = null; ui.details = null; }
  if (ui.tlGroup !== 'all' && !S.groups.some(g => g.id === ui.tlGroup)) ui.tlGroup = 'all';
  if (ui.cat && !S.categories.some(c => c.id === ui.cat)) ui.cat = '';
  ui.filter = ui.filter.filter(id => S.users.some(u => u.id === id && u.active));
}
async function loadDetails() {
  const id = ui.openTask;
  if (!id) return;
  try {
    const d = await api('GET', '/api/tasks/' + id + '/details');
    if (ui.openTask === id) ui.details = { taskId: id, ...d };
  } catch { /* la fiche reste affichable sans les détails */ }
}

const cur = () => S && S.users.find(u => u.id === S.me);
const isAdmin = () => cur()?.role === 'admin';
const userById = id => (S && S.users.find(u => u.id === id)) || { name: '—', active: false };
const groupById = id => S.groups.find(g => g.id === id) || { id, name: 'Sans groupe', icon: '📁', color: '#666A6F', members: [] };
const catById = id => S.categories.find(c => c.id === id) || { id, label: 'Sans catégorie', emoji: '📁', hidden: true };
const ini = u => (u.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const pct = t => t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : (t.completed ? 100 : 0);
const daysLeft = t => diffD(iso(today()), t.end);
function status(t) { if (pct(t) === 100) return 'done'; const d = daysLeft(t); if (d < 0) return 'late'; if (d <= 7) return 'soon'; return 'ok'; }
const isShared = g => (g.members || []).length > 1;
const people = () => S.users.filter(u => u.role !== 'admin' && u.active);
// Groupes communs d'abord, puis groupes privés ; dans l'ordre de création.
// Les groupes arrivent du serveur dans l'ordre réglé par l'administrateur.
const sortGroups = list => [...list];
const myGroups = () => { const me = cur(); return sortGroups(isAdmin() ? S.groups : S.groups.filter(g => (g.members || []).includes(me.id))); };
const canEdit = t => { const me = cur(); return isAdmin() || t.ownerId === me.id || (groupById(t.groupId).members || []).includes(me.id); };
function taskConcerns(t, ids) { if (t.ownerId) return ids.includes(t.ownerId); return (groupById(t.groupId).members || []).some(m => ids.includes(m)); }

function matchesSearch(t, q) {
  if (!q) return true;
  const hay = norm([t.title, t.desc, catById(t.type).label, groupById(t.groupId).name, t.ownerId ? userById(t.ownerId).name : '',
    ...t.steps.map(s => s.label + ' ' + s.desc)].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
// Tâches affichées après les filtres (personnes, recherche, catégorie, terminées).
function visibleTasks({ ignoreDone = false } = {}) {
  const me = cur(); if (!me) return [];
  let list = S.tasks;
  if (me.role === 'admin' && ui.filter.length) list = list.filter(t => taskConcerns(t, ui.filter));
  if (me.role !== 'admin' && ui.onlyMine) list = list.filter(t => t.ownerId === me.id || (!t.ownerId && (groupById(t.groupId).members || []).includes(me.id)));
  if (ui.cat) list = list.filter(t => t.type === ui.cat);
  if (ui.search) list = list.filter(t => matchesSearch(t, ui.search));
  if (ui.hideDone && !ignoreDone) list = list.filter(t => status(t) !== 'done');
  if (ui.statusFilter && !ignoreDone) list = list.filter(t => ui.statusFilter === 'open' ? status(t) !== 'done' : status(t) === ui.statusFilter);
  return list;
}
const filtersActive = () => !!(ui.search || ui.cat || ui.statusFilter || (isAdmin() && ui.filter.length) || (!isAdmin() && ui.onlyMine));
function visibleGroups(tasks) {
  let list;
  if (!isAdmin()) {
    const mine = myGroups();
    list = S.groups.filter(g => mine.includes(g) || tasks.some(t => t.groupId === g.id));
  } else if (!ui.filter.length) list = S.groups;
  else list = S.groups.filter(g => tasks.some(t => t.groupId === g.id) || (g.members || []).some(m => ui.filter.includes(m)));
  // Avec une recherche ou une catégorie, on n'affiche que les groupes qui ont des résultats.
  if (ui.search || ui.cat || ui.statusFilter) list = list.filter(g => tasks.some(t => t.groupId === g.id));
  return sortGroups(list);
}
function groupName(g) {
  // Les groupes « Perso » portent le même nom : l'admin voit à qui ils appartiennent
  if (isAdmin() && !isShared(g) && g.members?.length) return `${esc(g.name)} · ${esc(userById(g.members[0]).name)}`;
  return esc(g.name);
}
// Date à laquelle une tâche terminée quittera l'écran (« AAAA-MM-JJ HH:MM:SS » UTC → date locale).
function disparitionLe(t) {
  if (!t.doneAt) return null;
  const d = new Date(String(t.doneAt).replace(' ', 'T') + 'Z');
  d.setDate(d.getDate() + (S.archiveJours || 7));
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
const statusLabel = t => ({ done: 'Terminé', late: 'En retard', soon: 'Sous 7 jours', ok: 'En cours' })[status(t)];
