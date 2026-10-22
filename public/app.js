// Interface « Projets Le Roy » — reprise de prototype.html, branchée sur le serveur.
'use strict';

const IMG = { full: '/img/logo-complet.png', lr: '/img/logo-le-roy.png', llc: '/img/logo-llc.png' };
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
};
const TYPES = [
  { id: 'devis', label: 'Devis', e: '🧾' },
  { id: 'chantier', label: 'Chantier', e: '🏗️' },
  { id: 'commercial', label: 'Commercial', e: '🤝' },
  { id: 'dev', label: 'Développement', e: '💻' },
  { id: 'admin', label: 'Administratif', e: '📋' },
  { id: 'prod', label: 'Production', e: '⚙️' },
  { id: 'event', label: 'Salon / évènement', e: '🎪' },
  { id: 'perso', label: 'Perso', e: '🏡' }
];
const GROUP_ICONS = ['img:lr', 'img:llc', '🏢', '🐔', '🥚', '🚜', '📦', '🛠️', '💡', '📊', '👥', '🏡', '🎯', '🌍'];
const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];

const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const iso = d => { const z = new Date(d); return z.getFullYear() + '-' + String(z.getMonth() + 1).padStart(2, '0') + '-' + String(z.getDate()).padStart(2, '0'); };
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addD = (n, base) => iso((base ? pd(base) : today()).getTime() + n * DAY);
const diffD = (a, b) => Math.round((pd(b) - pd(a)) / DAY);
const fmt = s => pd(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtLong = s => pd(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const emo = e => `<i class="emo" aria-hidden="true">${e}</i>`;
const gIcon = (icon, alt) => icon && icon.startsWith('img:') ? `<img src="${IMG[icon.slice(4)]}" alt="${esc(alt || '')}">` : emo(esc(icon || '📁'));
const $ = s => document.querySelector(s);

/* ---------- Échanges avec le serveur ---------- */
let S = null;      // données de la personne connectée (null = pas connecté)
let L = null;      // comptes affichés sur l'écran de connexion
const ui = { view: 'home', loginUser: null, loginErr: '', filter: [], tlGroup: 'all', editId: null, editGroup: null, presetGroup: null, openTask: null, confirmDel: false, pwdErr: '', busy: false };

async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') opt.headers['Content-Type'] = 'application/json';
  if (body !== undefined) opt.body = JSON.stringify(body);
  let res;
  try { res = await fetch(url, opt); }
  catch { throw new Error('Le serveur ne répond pas. Vérifiez que le PC serveur est allumé.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { S = null; stopEvents(); await loadLogin(); render(); throw new Error(data.error || 'Session expirée.'); }
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

async function loadLogin() {
  try { L = await api('GET', '/api/comptes'); } catch (e) { L = { users: [], error: e.message }; }
}
async function refresh() {
  const data = await api('GET', '/api/state');
  S = data;
  if (ui.openTask && !S.tasks.some(t => t.id === ui.openTask)) ui.openTask = null;
  if (ui.tlGroup !== 'all' && !S.groups.some(g => g.id === ui.tlGroup)) ui.tlGroup = 'all';
  ui.filter = ui.filter.filter(id => S.users.some(u => u.id === id));
}
// Lance une modification, recharge les données et réaffiche. Affiche l'erreur s'il y en a une.
async function act(fn, okMsg) {
  if (ui.busy) return false;
  ui.busy = true;
  try { await fn(); await refresh(); render(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(e.message); return false; }
  finally { ui.busy = false; }
}

/* ---------- Temps réel : chacun voit les changements des autres ---------- */
let es = null, wasDown = false;
function startEvents() {
  if (es || !window.EventSource) return;
  es = new EventSource('/api/events');
  es.addEventListener('change', () => liveUpdate());
  es.onopen = () => { $('#offline').hidden = true; if (wasDown) { wasDown = false; liveUpdate(); } };
  es.onerror = () => { wasDown = true; $('#offline').hidden = false; };
}
function stopEvents() { if (es) { es.close(); es = null; } $('#offline').hidden = true; }
let liveT;
function liveUpdate() {
  clearTimeout(liveT);
  liveT = setTimeout(async () => {
    if (!S) return;
    try { await refresh(); } catch { return; }
    // On ne réaffiche pas pendant une saisie pour ne pas effacer ce qui est en cours d'écriture.
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    const formView = ['newTask', 'newGroup', 'account'].includes(ui.view);
    if (!formView && !typing) render();
    else if (!typing) renderModal();
  }, 150);
}

/* ---------- Règles (identiques à la maquette) ---------- */
const cur = () => S && S.users.find(u => u.id === S.me);
const isAdmin = () => cur()?.role === 'admin';
const userById = id => S.users.find(u => u.id === id) || { name: '—' };
const groupById = id => S.groups.find(g => g.id === id) || { name: 'Sans groupe', icon: '📁', color: '#666A6F', members: [] };
const typeById = id => TYPES.find(t => t.id === id) || TYPES[0];
const ini = u => (u.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const pct = t => t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : 0;
const daysLeft = t => diffD(iso(today()), t.end);
function status(t) { if (t.steps.length && pct(t) === 100) return 'done'; const d = daysLeft(t); if (d < 0) return 'late'; if (d <= 7) return 'soon'; return 'ok'; }
const isShared = g => (g.members || []).length > 1;
const myGroups = () => { const me = cur(); return isAdmin() ? S.groups : S.groups.filter(g => (g.members || []).includes(me.id)); };
const canEdit = t => { const me = cur(); return isAdmin() || t.ownerId === me.id || (groupById(t.groupId).members || []).includes(me.id); };
function taskConcerns(t, ids) { if (t.ownerId) return ids.includes(t.ownerId); return (groupById(t.groupId).members || []).some(m => ids.includes(m)); }
function visibleTasks() {
  const me = cur(); if (!me) return [];
  if (me.role === 'admin') return ui.filter.length ? S.tasks.filter(t => taskConcerns(t, ui.filter)) : S.tasks;
  return S.tasks; // le serveur n'envoie déjà que les tâches visibles
}
function visibleGroups(tasks) {
  if (!isAdmin()) {
    const mine = myGroups();
    // + les groupes d'autres équipes où une tâche m'est attribuée
    return S.groups.filter(g => mine.includes(g) || tasks.some(t => t.groupId === g.id));
  }
  if (!ui.filter.length) return S.groups;
  return S.groups.filter(g => tasks.some(t => t.groupId === g.id) || (g.members || []).some(m => ui.filter.includes(m)));
}
function badge(t) {
  const s = status(t), d = daysLeft(t);
  if (s === 'late') return `<span class="badge late">${emo('🚨')}En retard · ${-d} j</span>`;
  if (s === 'soon') return `<span class="badge soon">${emo('⚠️')}${d === 0 ? "Fin aujourd'hui" : 'J-' + d}</span>`;
  if (s === 'done') return `<span class="badge done">${emo('✅')}Terminé</span>`;
  return '';
}
function who(t) { if (!t.ownerId) return `<span class="who">${emo('👥')}Tout le groupe</span>`; const u = userById(t.ownerId); return `<span class="who"><span class="av">${ini(u)}</span>${esc(u.name)}</span>`; }
const avStack = ids => `<span class="stack-av">${ids.map(id => { const u = userById(id); return `<span class="av" title="${esc(u.name)}">${ini(u)}</span>`; }).join('')}</span>`;
const people = () => S.users.filter(u => u.role !== 'admin');

/* ---------- Écrans ---------- */
function vLogin() {
  const sel = ui.loginUser, users = (L && L.users) || [];
  const selUser = users.find(u => u.id === sel);
  return `<section class="login"><div class="panel">
  <div class="logo-big"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span></div>
  <p class="eyebrow">Projets &amp; tâches</p><h1>Connexion</h1><p class="lead">Choisissez votre compte.</p>
  ${L && L.error ? `<p class="err">${esc(L.error)}</p>` : ''}
  <div class="ulist">${users.map(u => `<button type="button" class="ubtn ${sel === u.id ? 'on' : ''}" data-act="pick-user" data-id="${esc(u.id)}"><span class="av">${ini(u)}</span>${esc(u.name)}<small>${u.role === 'admin' ? 'Vue globale' : 'Mes tâches'}</small></button>`).join('')}</div>
  ${selUser ? `<form id="login-form" class="form">
   <label class="field"><span>Mot de passe de ${esc(selUser.name)}</span><input type="password" id="l-pwd" autocomplete="current-password" required></label>
   ${ui.loginErr ? `<p class="err">${esc(ui.loginErr)}</p>` : ''}
   <button class="btn primary">Se connecter</button></form>` : ''}
  ${L && L.demo ? `<p class="hint" style="margin-top:16px">Mode démo. Mot de passe : 0000 · Administrateur : admin</p>`
    : L && L.defaultAdminPassword ? `<p class="hint" style="margin-top:16px">Premier démarrage : compte « Administrateur », mot de passe <b>admin</b>. Pensez à le changer dans « Compte ».</p>` : ''}
 </div></section>`;
}

function filterBar() {
  return `<div class="filter" role="group" aria-label="Filtrer par personne"><span class="flabel">Afficher</span>
 <button class="chip all ${!ui.filter.length ? 'on' : ''}" data-act="filter-user" data-id="all">${emo('👥')} Tout le monde</button>
 ${people().map(u => `<button class="chip ${ui.filter.includes(u.id) ? 'on' : ''}" data-act="filter-user" data-id="${esc(u.id)}" aria-pressed="${ui.filter.includes(u.id)}"><span class="av">${ini(u)}</span>${esc(u.name)}</button>`).join('')}</div>`;
}

function taskRow(t) {
  const ty = typeById(t.type), p = pct(t), st = status(t);
  return `<li><button class="trow st-${st}" data-act="open-task" data-id="${esc(t.id)}">
  <span class="ttile" title="${ty.label}">${emo(ty.e)}</span>
  <span class="tmain"><span class="ttitle">${esc(t.title)}</span>
   <span class="tmeta"><span class="date">Fin ${fmt(t.end)}</span>${who(t)}${badge(t)}</span>
   <span class="bar"><span style="width:${p}%"></span></span></span>
  <span class="tpct">${p}<small>%</small></span></button></li>`;
}

function groupName(g) {
  // Les groupes « Perso » portent le même nom : l'admin voit à qui ils appartiennent
  if (isAdmin() && !isShared(g) && g.members?.length) return `${esc(g.name)} · ${esc(userById(g.members[0]).name)}`;
  return esc(g.name);
}

function vHome() {
  const me = cur(), admin = me.role === 'admin', tasks = visibleTasks();
  const open = tasks.filter(t => status(t) !== 'done');
  const soon = tasks.filter(t => status(t) === 'soon').length, late = tasks.filter(t => status(t) === 'late').length;
  const order = { late: 0, soon: 1, ok: 2, done: 3 };
  const groups = visibleGroups(tasks);
  return `${admin && S.defaultAdminPassword ? `<p class="warnbox" style="margin-bottom:16px">${emo('🔑')} Le mot de passe administrateur est encore « admin ». <button class="link" data-act="nav" data-v="account">Le changer maintenant</button></p>` : ''}
  <section class="page-head"><div><p class="eyebrow">${admin ? 'Vue globale' : 'Mes tâches'}</p><h1>Projets en cours</h1></div>
  <div class="stats"><span class="stat">${emo('📌')}<b>${open.length}</b>en cours</span><span class="stat">${emo('⚠️')}<b>${soon}</b>sous 7 jours</span><span class="stat">${emo('🚨')}<b>${late}</b>en retard</span></div></section>
  ${admin ? filterBar() : ''}
  <div class="groups">${groups.map(g => {
    const list = tasks.filter(t => t.groupId === g.id).sort((a, b) => order[status(a)] - order[status(b)] || a.end.localeCompare(b.end));
    const shared = isShared(g);
    const canAdd = admin || (g.members || []).includes(me.id);
    return `<article class="gcard ${list.length >= 5 ? 'wide' : ''}" style="--g:${esc(g.color)}">
    <header class="gcard-h"><span class="gtile ${g.icon.startsWith('img:') ? 'img' : ''}">${gIcon(g.icon, g.name)}</span>
     <div class="gtitle"><h2>${groupName(g)}</h2><span class="gsub">${avStack(g.members || [])}${shared ? '<span class="commun">Commun</span>' : ''}<span>${list.length} tâche${list.length > 1 ? 's' : ''}</span></span></div>
     ${canAdd ? `<button class="icon-btn" data-act="new-task-in" data-g="${esc(g.id)}" aria-label="Ajouter une tâche dans ${esc(g.name)}">${ic('plus')}</button>` : ''}</header>
    <ul class="tlist">${list.length ? list.map(taskRow).join('') : `<li class="empty">Aucune tâche ici. ${canAdd ? `<button class="link" data-act="new-task-in" data-g="${esc(g.id)}">Ajouter une tâche</button>` : ''}</li>`}</ul></article>`;
  }).join('') || `<div class="panel"><p class="hint">${admin ? 'Aucun groupe pour l\'instant. Ajoutez d\'abord les comptes de l\'équipe (onglet « Compte »), puis créez un groupe depuis l\'onglet « Groupe ».' : 'Vous ne faites partie d\'aucun groupe pour l\'instant. Créez-en un depuis l\'onglet « Groupe ».'}</p></div>`}</div>`;
}

function vTimeline() {
  const admin = isAdmin();
  let tasks = visibleTasks();
  const groups0 = visibleGroups(tasks).filter(g => tasks.some(t => t.groupId === g.id));
  if (ui.tlGroup !== 'all') tasks = tasks.filter(t => t.groupId === ui.tlGroup);
  const tabs = `<div class="tabs" role="tablist"><button class="tab ${ui.tlGroup === 'all' ? 'on' : ''}" data-act="tl-group" data-id="all">Tous</button>${groups0.map(g => `<button class="tab ${ui.tlGroup === g.id ? 'on' : ''}" data-act="tl-group" data-id="${esc(g.id)}">${gIcon(g.icon, '')}${groupName(g)}</button>`).join('')}</div>`;
  const head = `<section class="page-head"><div><p class="eyebrow">${admin ? 'Vue globale' : 'Mes tâches'}</p><h1>Timeline</h1></div></section>${admin ? filterBar() : ''}${tabs}`;
  if (!tasks.length) return head + `<div class="panel"><p class="hint">Aucune tâche à afficher pour ce filtre.</p></div>`;
  const t0 = iso(today());
  const min = tasks.reduce((m, t) => t.start < m ? t.start : m, t0), max = tasks.reduce((m, t) => t.end > m ? t.end : m, t0);
  let start = addD(-3, min); const dow = (pd(start).getDay() + 6) % 7; start = addD(-dow, start);
  const end = addD(10, max), N = diffD(start, end) + 1, DPD = 24, W = N * DPD;
  let rows = '';
  S.groups.filter(g => tasks.some(t => t.groupId === g.id)).forEach(g => {
    rows += `<div class="tl-row tl-ghead" style="--g:${esc(g.color)}"><div class="tl-lab">${gIcon(g.icon, '')}${groupName(g)}</div><div class="tl-track"></div></div>`;
    tasks.filter(t => t.groupId === g.id).sort((a, b) => a.start.localeCompare(b.start)).forEach(t => {
      const p = pct(t), st = status(t), left = diffD(start, t.start) * DPD, w = Math.max(1, diffD(t.start, t.end) + 1) * DPD;
      const owner = t.ownerId ? `<span class="av" title="${esc(userById(t.ownerId).name)}">${ini(userById(t.ownerId))}</span>` : `<span title="Tout le groupe">${emo('👥')}</span>`;
      rows += `<div class="tl-row" style="--g:${esc(g.color)}"><div class="tl-lab" title="${esc(t.title)}">${emo(typeById(t.type).e)}<span class="nm">${esc(t.title)}</span>${owner}</div>
   <div class="tl-track"><button class="tbar st-${st} ${w < 70 ? 'out' : ''}" style="left:${left}px;width:${w}px" data-act="open-task" data-id="${esc(t.id)}" aria-label="${esc(t.title)}, ${p} %"><span class="fill" style="width:${p}%"></span><span class="blab">${p} %</span></button></div></div>`;
    });
  });
  let ticks = '';
  for (let i = 0; i < N; i++) {
    const d = pd(addD(i, start));
    if (d.getDay() === 1) {
      const first = i === 0 || d.getDate() <= 7;
      ticks += `<span class="tick" style="left:${i * DPD}px">${first ? `<b>${d.toLocaleDateString('fr-FR', { month: 'long' })}</b>` : '<b>&nbsp;</b>'}${d.getDate()}</span>`;
    }
  }
  const tx = diffD(start, t0) * DPD + DPD / 2;
  return head + `<div class="tl-wrap"><div class="tl" style="--W:${W}px;--dpd:${DPD}px">${rows}
  <div class="tl-row tl-axis"><div class="tl-lab">Dates</div><div class="tl-track">${ticks}</div></div>
  <div class="today" style="left:calc(var(--lab) + ${tx}px)"><span>Auj.</span></div></div></div>
  <div class="legend"><span><i style="background:var(--steel)"></i>Partie remplie = % d'étapes cochées</span><span><i style="background:var(--ok)"></i>Terminé</span><span><i style="box-shadow:0 0 0 2px var(--err)"></i>En retard</span><span>${emo('👥')} Tâche commune au groupe</span></div>`;
}

function stepRow(s) {
  return `<li class="sed" data-sid="${s ? esc(s.id) : ''}" data-done="${s && s.done ? 1 : 0}"><div class="sed-f"><input type="text" class="s-label" maxlength="300" placeholder="Étape (ex. : valider le plan)" value="${esc(s ? s.label : '')}" aria-label="Nom de l'étape"><input type="text" class="s-desc" maxlength="2000" placeholder="Description (facultatif)" value="${esc(s ? s.desc : '')}" aria-label="Description de l'étape"></div><button type="button" class="del" data-act="draft-del-step" aria-label="Retirer l'étape">${ic('trash')}</button></li>`;
}

function ownerOptions(gid, selected) {
  const g = groupById(gid), me = cur();
  const ids = [...(g.members || [])];
  if (!isAdmin() && !ids.includes(me.id)) ids.push(me.id);
  const opts = [];
  if (isShared(g)) opts.push(`<option value="" ${!selected ? 'selected' : ''}>👥 Tout le groupe (tâche commune)</option>`);
  ids.forEach(id => opts.push(`<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(userById(id).name)}</option>`));
  if (!ids.length) opts.push(`<option value="">Aucun membre dans ce groupe</option>`);
  return opts.join('');
}
function vNewTask() {
  const me = cur(), t = ui.editId ? S.tasks.find(x => x.id === ui.editId) : null;
  let groups = myGroups();
  if (t && !groups.some(x => x.id === t.groupId)) groups = [groupById(t.groupId), ...groups];
  const g = t ? t.groupId : (ui.presetGroup && groups.some(x => x.id === ui.presetGroup) ? ui.presetGroup : groups[0]?.id);
  if (!g) return `<section class="form-page"><p class="eyebrow">Nouvelle tâche</p><h1>Créer une tâche</h1><div class="panel"><p class="hint">Créez d'abord un groupe pour y ranger la tâche.</p><div class="actions"><button class="btn primary" data-act="nav" data-v="newGroup">Créer un groupe</button></div></div></section>`;
  let o = t ? t.ownerId : (isShared(groupById(g)) && isAdmin() ? null : me.id);
  if (!t && isAdmin() && !isShared(groupById(g))) o = groupById(g).members?.[0] || null;
  const ty = t ? t.type : 'devis';
  return `<section class="form-page"><p class="eyebrow">${t ? 'Modifier la tâche' : 'Nouvelle tâche'}</p><h1>${t ? esc(t.title) : 'Créer une tâche'}</h1>
 <form id="task-form" class="panel form" novalidate>
  <label class="field"><span>Titre</span><input type="text" id="f-title" maxlength="200" required value="${esc(t ? t.title : '')}" placeholder="Ex. : Devis pondoirs – élevage Martin"></label>
  <div class="row2"><label class="field"><span>Groupe</span><select id="f-group">${groups.map(x => `<option value="${esc(x.id)}" ${x.id === g ? 'selected' : ''}>${groupName(x)}${isShared(x) ? ' (commun)' : ''}</option>`).join('')}</select></label>
  <label class="field"><span>Pour qui</span><select id="f-owner">${ownerOptions(g, o)}</select></label></div>
  <fieldset class="field"><legend>Type de projet</legend><div class="pick">${TYPES.map(x => `<label><input type="radio" name="f-type" id="ft-${x.id}" value="${x.id}" ${x.id === ty ? 'checked' : ''}><span class="opt">${emo(x.e)}${x.label}</span></label>`).join('')}</div></fieldset>
  <div class="row2"><label class="field"><span>Début</span><input type="date" id="f-start" value="${t ? t.start : iso(today())}"></label>
  <label class="field"><span>Fin</span><input type="date" id="f-end" value="${t ? t.end : addD(14)}"></label></div>
  <label class="field"><span>Description</span><textarea id="f-desc" maxlength="5000" placeholder="Contexte, client, points d'attention">${esc(t ? t.desc : '')}</textarea></label>
  <fieldset class="field"><legend>Étapes</legend><ol class="steps-ed" id="steps-ed">${(t && t.steps.length ? t.steps : [null, null]).map(stepRow).join('')}</ol>
   <div><button type="button" class="btn sm" data-act="draft-add-step">${ic('plus', 'sm')}Ajouter une étape</button></div>
   <p class="hint">L'avancement de la tâche se calcule à partir des étapes cochées.</p></fieldset>
  <div class="actions"><button type="button" class="btn" data-act="cancel-form">Annuler</button><button class="btn primary">${t ? 'Enregistrer' : 'Créer la tâche'}</button></div>
 </form></section>`;
}

function vNewGroup() {
  const me = cur(), admin = isAdmin(), g = ui.editGroup ? S.groups.find(x => x.id === ui.editGroup) : null;
  const members = g ? g.members || [] : (admin ? [] : [me.id]);
  const icon = g ? g.icon : '🐔', color = g ? g.color : GROUP_COLORS[2];
  const editable = S.groups.filter(x => admin || (x.members || []).includes(me.id));
  const icons = GROUP_ICONS.includes(icon) ? GROUP_ICONS : [...GROUP_ICONS, icon];
  const colors = GROUP_COLORS.includes(color) ? GROUP_COLORS : [...GROUP_COLORS, color];
  return `<section class="form-page"><p class="eyebrow">${g ? 'Modifier le groupe' : 'Nouveau groupe'}</p><h1>${g ? esc(g.name) : 'Créer un groupe'}</h1>
 <form id="group-form" class="panel form" novalidate>
  <label class="field"><span>Nom du groupe</span><input type="text" id="g-name" maxlength="80" required value="${esc(g ? g.name : '')}" placeholder="Ex. : Salon 2027"></label>
  <fieldset class="field"><legend>Membres</legend><div class="pick">${people().map(u => {
    const on = members.includes(u.id), lock = !admin && u.id === me.id;
    return `<label><input type="checkbox" name="g-mem" id="gm-${esc(u.id)}" value="${esc(u.id)}" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''}><span class="opt"><span class="av">${ini(u)}</span>${esc(u.name)}${lock ? ' (vous)' : ''}</span></label>`;
  }).join('') || '<p class="hint">Aucun compte utilisateur pour l\'instant : ajoutez l\'équipe depuis l\'onglet « Compte ».</p>'}</div>
   <p class="hint">Avec deux membres ou plus, le groupe est commun : chacun voit et peut faire avancer toutes ses tâches. Avec un seul membre, il reste privé.</p></fieldset>
  <fieldset class="field"><legend>Logo</legend><div class="pick">${icons.map((x, i) => `<label><input type="radio" name="g-icon" id="gi-${i}" value="${esc(x)}" ${x === icon ? 'checked' : ''} aria-label="Logo ${x.startsWith('img:') ? (x === 'img:lr' ? 'Le Roy' : 'LLC') : esc(x)}"><span class="opt tile">${gIcon(x, '')}</span></label>`).join('')}</div></fieldset>
  <fieldset class="field"><legend>Couleur</legend><div class="pick">${colors.map((c, i) => `<label><input type="radio" name="g-color" id="gc-${i}" value="${esc(c)}" ${c === color ? 'checked' : ''} aria-label="Couleur ${i + 1}"><span class="swatch" style="--c:${esc(c)}"></span></label>`).join('')}</div></fieldset>
  <div class="actions"><button type="button" class="btn" data-act="cancel-form">Annuler</button><button class="btn primary">${g ? 'Enregistrer' : 'Créer le groupe'}</button></div>
 </form>
 <div class="panel" style="margin-top:16px"><h3>Groupes existants</h3><ul class="glist">${editable.map(x => {
    const n = S.tasks.filter(t => t.groupId === x.id).length;
    return `<li><span class="gtile ${x.icon.startsWith('img:') ? 'img' : ''}" style="--g:${esc(x.color)}">${gIcon(x.icon, '')}</span><b>${groupName(x)}</b>${avStack(x.members || [])}<span class="hint">${n} tâche${n > 1 ? 's' : ''}</span>
  <button class="del" data-act="edit-group" data-id="${esc(x.id)}" aria-label="Modifier ${esc(x.name)}">${ic('edit')}</button>${n ? '' : `<button class="del" data-act="del-group" data-id="${esc(x.id)}" aria-label="Supprimer ${esc(x.name)}">${ic('trash')}</button>`}</li>`;
  }).join('') || '<li class="hint">Aucun groupe pour l\'instant.</li>'}</ul>
  <p class="hint" style="margin-top:10px">Un groupe ne peut être supprimé que s'il ne contient plus de tâche.</p></div></section>`;
}

function vAccount() {
  const me = cur(), admin = me.role === 'admin';
  const mine = admin ? (S.taskCounts[me.id] || 0) : S.tasks.filter(t => t.ownerId === me.id).length;
  return `<section class="acc"><div><p class="eyebrow">Compte</p><h1 style="font-size:34px">Mon compte</h1></div>
 <div class="panel acc-id"><span class="av">${ini(me)}</span><div><h2>${esc(me.name)}</h2><p>${admin ? 'Administrateur · voit et attribue les tâches de toute l\'équipe' : 'Utilisateur · voit ses tâches et celles de ses groupes'} · ${mine} tâche${mine > 1 ? 's' : ''} à son nom</p></div>
  <button class="btn" data-act="logout">${ic('logout', 'sm')}Se déconnecter</button></div>
 <form id="pwd-form" class="panel form"><h3>Changer de mot de passe</h3>
  ${admin && S.defaultAdminPassword ? `<p class="warnbox">${emo('🔑')} Le mot de passe est encore « admin » : choisissez-en un nouveau.</p>` : ''}
  <div class="row2"><label class="field"><span>Mot de passe actuel</span><input type="password" id="p-old" autocomplete="current-password"></label>
  <label class="field"><span>Nouveau mot de passe</span><input type="password" id="p-new" autocomplete="new-password"></label></div>
  ${ui.pwdErr ? `<p class="err">${esc(ui.pwdErr)}</p>` : ''}
  <div class="actions"><button class="btn primary">Mettre à jour</button></div></form>
 ${admin ? `<div class="panel"><h3>Équipe</h3><ul class="team">${S.users.map(u => { const n = S.taskCounts[u.id] || 0; return `<li><span class="av">${ini(u)}</span><b>${esc(u.name)}</b><span class="meta">${n} tâche${n > 1 ? 's' : ''}</span><span class="rolechip ${u.role}">${u.role === 'admin' ? 'Admin' : 'Utilisateur'}</span></li>`; }).join('')}</ul>
  <form id="user-form" class="inline3"><label class="field"><span>Nom</span><input type="text" id="n-name" maxlength="60" required></label>
  <label class="field"><span>Mot de passe</span><input type="text" id="n-pwd" required value="0000"></label>
  <label class="field"><span>Rôle</span><select id="n-role"><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></label>
  <button class="btn primary">Ajouter</button></form>
  <p class="hint" style="margin-top:10px">Chaque nouvel utilisateur reçoit automatiquement son groupe privé « Perso ». Donnez-lui son mot de passe : il pourra le changer depuis sa page Compte.</p></div>` : ''}
 </section>`;
}

/* ---------- Rendu ---------- */
function render() {
  const me = cur(); if (!me) ui.view = 'login'; else if (ui.view === 'login') ui.view = 'home';
  const v = ui.view;
  const tabs = [['home', 'Accueil'], ['timeline', 'Timeline'], ['newTask', 'Tâche', 1], ['newGroup', 'Groupe', 1], ['account', 'Compte']];
  $('#hdr').innerHTML = `<div class="brandbar"><div class="wrap"><div class="logo"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span><span class="app">Projets</span></div>
  ${me ? `<button class="me" data-act="nav" data-v="account"><span class="av">${ini(me)}</span><span class="nm">${esc(me.name)}</span>${me.role === 'admin' ? '<span class="role-tag">Admin</span>' : ''}</button>` : ''}</div></div>
  ${me ? `<div class="tabsbar"><div class="wrap"><nav aria-label="Navigation principale">${tabs.map(([id, l, p]) => `<button data-act="nav" data-v="${id}" ${v === id && !((id === 'newTask' && ui.editId) || (id === 'newGroup' && ui.editGroup)) ? 'aria-current="page"' : ''}>${p ? '<span class="plus">+</span>' : ''}${l}</button>`).join('')}</nav></div></div>` : ''}`;
  $('#main').innerHTML = ({ login: vLogin, home: vHome, timeline: vTimeline, newTask: vNewTask, newGroup: vNewGroup, account: vAccount })[v]();
  renderModal();
}
function renderModal() {
  const m = $('#modal'), t = S && S.tasks.find(x => x.id === ui.openTask), me = cur();
  if (!t || !me) { m.hidden = true; m.innerHTML = ''; document.documentElement.style.overflow = ''; return; }
  const g = groupById(t.groupId), ty = typeById(t.type), p = pct(t), done = t.steps.filter(s => s.done).length, can = canEdit(t), st = status(t);
  m.hidden = false; document.documentElement.style.overflow = 'hidden';
  m.innerHTML = `<div class="scrim" data-act="close-modal"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt" style="--g:${esc(g.color)}">
 <div class="sheet-h"><div class="crumbs"><span class="tag g">${gIcon(g.icon, '')}${groupName(g)}</span><span class="tag">${emo(ty.e)}${ty.label}</span>${isShared(g) ? '<span class="tag">' + emo('👥') + 'Groupe commun</span>' : ''}</div><button class="icon-btn" data-act="close-modal" aria-label="Fermer">${ic('close')}</button></div>
 <h2 id="mt">${esc(t.title)}</h2>
 <dl class="facts"><div><dt>Pour qui</dt><dd>${t.ownerId ? esc(userById(t.ownerId).name) : 'Tout le groupe'}</dd></div><div><dt>Début</dt><dd class="mono">${fmtLong(t.start)}</dd></div><div><dt>Fin</dt><dd><span class="mono">${fmtLong(t.end)}</span>${badge(t)}</dd></div></dl>
 ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ''}
 <div class="prog"><div class="prog-n">${p}<small>%</small></div><div class="prog-b"><span class="bar big"><span style="width:${p}%;background:${st === 'done' ? 'var(--ok)' : 'var(--g)'}"></span></span><p>${done} étape${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''} sur ${t.steps.length}</p></div></div>
 <h3>Étapes</h3>
 <ol class="steps">${t.steps.map(s => `<li class="step ${s.done ? 'done' : ''}"><button class="check" data-act="toggle-step" data-s="${esc(s.id)}" aria-pressed="${s.done}" aria-label="${s.done ? 'Décocher' : 'Cocher'} : ${esc(s.label)}" ${can ? '' : 'disabled'}>${ic('check')}</button><div><p class="sl">${esc(s.label)}</p>${s.desc ? `<p class="sd">${esc(s.desc)}</p>` : ''}</div>${can ? `<button class="del" data-act="del-step" data-s="${esc(s.id)}" aria-label="Supprimer l'étape">${ic('trash')}</button>` : '<span></span>'}</li>`).join('') || '<li class="step"><span></span><p class="sd">Aucune étape pour l\'instant.</p><span></span></li>'}</ol>
 ${can ? `<form id="step-form" class="addstep"><input type="text" id="ns-label" maxlength="300" placeholder="Nouvelle étape" required aria-label="Nouvelle étape"><input type="text" id="ns-desc" maxlength="2000" placeholder="Description (facultatif)" aria-label="Description"><button class="btn primary sm">${ic('plus', 'sm')}Ajouter</button></form>
 <div class="sheet-f"><button class="btn" data-act="edit-task">Modifier la tâche</button><button class="btn danger ${ui.confirmDel ? 'armed' : ''}" data-act="del-task">${ui.confirmDel ? 'Confirmer la suppression' : 'Supprimer'}</button></div>` : ''}
 </div>`;
}
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }
function go(v, keep) { ui.view = v; ui.pwdErr = ''; if (!keep) { ui.editId = null; ui.editGroup = null; ui.presetGroup = null; } render(); window.scrollTo(0, 0); }

/* ---------- Évènements ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, t = S && S.tasks.find(x => x.id === ui.openTask);
  switch (a) {
    case 'pick-user': ui.loginUser = id; ui.loginErr = ''; render(); setTimeout(() => $('#l-pwd')?.focus(), 0); break;
    case 'nav': ui.openTask = null; go(b.dataset.v); break;
    case 'new-task-in': ui.editId = null; ui.editGroup = null; ui.presetGroup = b.dataset.g; ui.openTask = null; go('newTask', true); break;
    case 'open-task': ui.openTask = id; ui.confirmDel = false; renderModal(); break;
    case 'close-modal': ui.openTask = null; renderModal(); break;
    case 'toggle-step': {
      // Affichage immédiat (utile sur tablette), puis enregistrement ; on revient en arrière en cas d'erreur.
      const s = t && t.steps.find(x => x.id === b.dataset.s); if (!s) break;
      const wasDone = pct(t) === 100;
      s.done = !s.done; render();
      if (!wasDone && pct(t) === 100) toast('Tâche terminée 🎉');
      try { await api('PATCH', '/api/steps/' + s.id, { done: s.done }); }
      catch (err) { s.done = !s.done; render(); toast(err.message); }
      break;
    }
    case 'del-step': await act(() => api('DELETE', '/api/steps/' + b.dataset.s)); break;
    case 'edit-task': if (!t) break; ui.editId = t.id; ui.openTask = null; go('newTask', true); break;
    case 'del-task':
      if (!t) break;
      if (!ui.confirmDel) { ui.confirmDel = true; renderModal(); break; }
      ui.confirmDel = false;
      await act(async () => { await api('DELETE', '/api/tasks/' + t.id); ui.openTask = null; }, 'Tâche supprimée');
      break;
    case 'filter-user': if (id === 'all') ui.filter = []; else { ui.filter = ui.filter.includes(id) ? ui.filter.filter(x => x !== id) : [...ui.filter, id]; } render(); break;
    case 'tl-group': ui.tlGroup = id; render(); break;
    case 'draft-add-step': { const ol = $('#steps-ed'); ol.insertAdjacentHTML('beforeend', stepRow(null)); ol.lastElementChild.querySelector('.s-label').focus(); break; }
    case 'draft-del-step': b.closest('.sed').remove(); break;
    case 'cancel-form': go('home'); break;
    case 'edit-group': ui.editGroup = id; go('newGroup', true); break;
    case 'del-group':
      await act(async () => { await api('DELETE', '/api/groups/' + id); if (ui.tlGroup === id) ui.tlGroup = 'all'; if (ui.editGroup === id) ui.editGroup = null; }, 'Groupe supprimé');
      break;
    case 'logout':
      try { await api('POST', '/api/logout', {}); } catch { /* on déconnecte quand même l'écran */ }
      S = null; stopEvents(); ui.loginUser = null; ui.openTask = null; ui.filter = []; ui.tlGroup = 'all';
      await loadLogin(); render(); break;
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'f-group') { const sel = $('#f-owner'); const g = groupById(e.target.value); sel.innerHTML = ownerOptions(g.id, isShared(g) ? null : (g.members?.[0] || cur().id)); }
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  // Empêche un double clic de créer deux fois la même chose.
  if (f.dataset.sending) return;
  f.dataset.sending = '1';
  try { await onSubmit(f); } finally { delete f.dataset.sending; }
});
async function onSubmit(f) {
  if (f.id === 'login-form') {
    try {
      await api('POST', '/api/login', { userId: ui.loginUser, password: $('#l-pwd').value });
      ui.loginErr = ''; ui.filter = []; ui.tlGroup = 'all';
      await refresh(); startEvents(); go('home');
    } catch (err) { ui.loginErr = err.message; render(); $('#l-pwd')?.focus(); }
  }
  if (f.id === 'task-form') {
    const title = $('#f-title').value.trim(), start = $('#f-start').value, end = $('#f-end').value;
    if (!title) return showErr(f, 'Donnez un titre à la tâche.');
    if (!start || !end) return showErr(f, 'Renseignez les dates de début et de fin.');
    if (end < start) return showErr(f, 'La date de fin doit être après la date de début.');
    const steps = [...f.querySelectorAll('.sed')].map(r => ({ id: r.dataset.sid || null, label: r.querySelector('.s-label').value.trim(), desc: r.querySelector('.s-desc').value.trim(), done: r.dataset.done === '1' })).filter(s => s.label);
    const data = { title, groupId: $('#f-group').value, ownerId: $('#f-owner').value || null, type: (f.querySelector('input[name=f-type]:checked') || {}).value || 'devis', start, end, desc: $('#f-desc').value.trim(), steps };
    const editId = ui.editId;
    const msg = editId ? 'Tâche enregistrée' : (data.ownerId && data.ownerId !== cur().id ? 'Tâche créée pour ' + userById(data.ownerId).name : 'Tâche créée');
    try {
      await api(editId ? 'PUT' : 'POST', editId ? '/api/tasks/' + editId : '/api/tasks', data);
      await refresh(); go('home'); toast(msg);
    } catch (err) { showErr(f, err.message); }
  }
  if (f.id === 'group-form') {
    const name = $('#g-name').value.trim(); if (!name) return showErr(f, 'Donnez un nom au groupe.');
    const members = [...f.querySelectorAll('input[name=g-mem]')].filter(x => x.checked).map(x => x.value);
    if (!isAdmin() && !members.includes(cur().id)) members.unshift(cur().id);
    if (!members.length) return showErr(f, 'Choisissez au moins une personne pour ce groupe.');
    const data = { name, members, icon: f.querySelector('input[name=g-icon]:checked').value, color: f.querySelector('input[name=g-color]:checked').value };
    const editId = ui.editGroup;
    try {
      await api(editId ? 'PUT' : 'POST', editId ? '/api/groups/' + editId : '/api/groups', data);
      await refresh(); go('home'); toast(editId ? 'Groupe enregistré' : 'Groupe créé');
    } catch (err) { showErr(f, err.message); }
  }
  if (f.id === 'step-form') {
    const t = S.tasks.find(x => x.id === ui.openTask), l = $('#ns-label').value.trim(); if (!t || !l) return;
    if (await act(() => api('POST', '/api/tasks/' + t.id + '/steps', { label: l, desc: $('#ns-desc').value.trim() }))) $('#ns-label')?.focus();
  }
  if (f.id === 'pwd-form') {
    const oldPassword = $('#p-old').value, newPassword = $('#p-new').value;
    if (newPassword.length < 4) { ui.pwdErr = 'Le nouveau mot de passe doit faire au moins 4 caractères.'; render(); return; }
    try {
      await api('POST', '/api/password', { oldPassword, newPassword });
      ui.pwdErr = ''; await refresh(); render(); toast('Mot de passe mis à jour');
    } catch (err) { ui.pwdErr = err.message; render(); }
  }
  if (f.id === 'user-form') {
    const n = $('#n-name').value.trim(), p = $('#n-pwd').value; if (!n || !p) return;
    await act(() => api('POST', '/api/users', { name: n, password: p, role: $('#n-role').value }), n + ' ajouté à l\'équipe');
  }
}
function showErr(f, msg) { let p = f.querySelector('.err'); if (!p) { p = document.createElement('p'); p.className = 'err'; f.querySelector('.actions').before(p); } p.textContent = msg; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.openTask) { ui.openTask = null; renderModal(); } });

/* ---------- Démarrage ---------- */
(async function init() {
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { await refresh(); startEvents(); }
  catch { S = null; if (!L) await loadLogin(); }
  render();
})();
