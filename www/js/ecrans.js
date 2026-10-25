// Écrans de l'application (fidèles à prototype.html, avec les ajouts : recherche, catégories, équipe, Claude…).
'use strict';

const avStack = ids => `<span class="stack-av">${ids.map(id => { const u = userById(id); return `<span class="av ${u.active ? '' : 'off'}" title="${esc(u.name)}">${ini(u)}</span>`; }).join('')}</span>`;

function badge(t) {
  const s = status(t), d = daysLeft(t);
  if (s === 'late') return `<span class="badge late">${emo('🚨')}En retard · ${-d} j</span>`;
  if (s === 'soon') return `<span class="badge soon">${emo('⚠️')}${d === 0 ? "Fin aujourd'hui" : 'J-' + d}</span>`;
  if (s === 'done') {
    const le = disparitionLe(t);
    return `<span class="badge done" ${le ? `title="Disparaîtra de l'écran ${esc(le)}"` : ''}>${emo('✅')}Terminé</span>`;
  }
  return '';
}
function who(t) {
  if (!t.ownerId) return `<span class="who">${emo('👥')}Tout le groupe</span>`;
  const u = userById(t.ownerId);
  return `<span class="who"><span class="av">${ini(u)}</span>${esc(u.name)}</span>`;
}

/* ---------- Connexion ---------- */
function vLogin() {
  const listing = !!(L && L.listing), users = (L && L.users) || [];
  const sel = ui.loginUser, selUser = users.find(u => u.id === sel);
  const champMdp = nom => `<label class="field"><span>Mot de passe${nom ? ' de ' + esc(nom) : ''}</span><input type="password" id="l-pwd" autocomplete="current-password" required></label>`;
  return `<section class="login"><div class="panel">
  <div class="logo-big"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span></div>
  <p class="eyebrow">Projets &amp; tâches</p><h1>Connexion</h1><p class="lead">${listing ? 'Choisissez votre compte.' : 'Entrez votre nom et votre mot de passe.'}</p>
  ${L && L.error ? `<p class="err">${esc(L.error)}</p>` : ''}
  ${listing ? `<div class="ulist">${users.map(u => `<button type="button" class="ubtn ${sel === u.id ? 'on' : ''}" data-act="pick-user" data-id="${esc(u.id)}"><span class="av">${ini(u)}</span>${esc(u.name)}<small>${u.role === 'admin' ? 'Vue globale' : 'Mes tâches'}</small></button>`).join('')}</div>
  ${selUser ? `<form id="login-form" class="form">${champMdp(selUser.name)}${ui.loginErr ? `<p class="err">${esc(ui.loginErr)}</p>` : ''}<button class="btn primary">Se connecter</button></form>` : ''}`
  : `<form id="login-form" class="form"><label class="field"><span>Votre nom</span><input type="text" id="l-name" autocomplete="username" required maxlength="60" value="${esc(ui.loginName || '')}"></label>
   ${champMdp('')}${ui.loginErr ? `<p class="err">${esc(ui.loginErr)}</p>` : ''}<button class="btn primary">Se connecter</button></form>`}
 </div></section>`;
}

/* ---------- Mot de passe provisoire : à changer avant tout ---------- */
function vMustChange() {
  return `<section class="login"><div class="panel">
  <div class="logo-big"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span></div>
  <p class="eyebrow">Bienvenue ${esc(S.name || '')}</p><h1>Choisissez votre mot de passe</h1>
  <p class="lead">Le mot de passe que l'on vous a donné est provisoire. Choisissez-en un qui n'est connu que de vous : <b>12 caractères minimum</b>. Une phrase facile à retenir convient très bien (par exemple « Le café du lundi matin »).</p>
  <form id="forced-pwd-form" class="form">
   <label class="field"><span>Mot de passe provisoire (celui reçu)</span><input type="password" id="fp-old" autocomplete="current-password" required></label>
   <label class="field"><span>Nouveau mot de passe</span><input type="password" id="fp-new" autocomplete="new-password" minlength="12" required></label>
   <label class="field"><span>Nouveau mot de passe, une seconde fois</span><input type="password" id="fp-new2" autocomplete="new-password" minlength="12" required></label>
   ${ui.pwdErr ? `<p class="err">${esc(ui.pwdErr)}</p>` : ''}
   <div class="actions"><button type="button" class="btn" data-act="logout">Se déconnecter</button><button class="btn primary">Enregistrer et continuer</button></div></form>
 </div></section>`;
}

/* ---------- Filtres (accueil et timeline) ---------- */
function filterBar() {
  return `<div class="filter" role="group" aria-label="Filtrer par personne"><span class="flabel">Afficher</span>
 <button class="chip all ${!ui.filter.length ? 'on' : ''}" data-act="filter-user" data-id="all">${emo('👥')} Tout le monde</button>
 ${people().map(u => `<button class="chip ${ui.filter.includes(u.id) ? 'on' : ''}" data-act="filter-user" data-id="${esc(u.id)}" aria-pressed="${ui.filter.includes(u.id)}"><span class="av">${ini(u)}</span>${esc(u.name)}</button>`).join('')}</div>`;
}
function toolbar() {
  const cats = S.categories.filter(c => !c.hidden || c.id === ui.cat);
  return `<div class="toolbar">
  <label class="searchbox">${ic('search')}<input type="search" id="q" value="${esc(ui.search)}" placeholder="Rechercher (titre, client, étape…)" aria-label="Rechercher une tâche"></label>
  <select id="f-cat" aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>${cats.map(c => `<option value="${esc(c.id)}" ${ui.cat === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.label)}</option>`).join('')}</select>
  <select id="f-prio" aria-label="Filtrer par priorité"><option value="">Toutes les priorités</option>${[1, 2, 3, 4].map(n => `<option value="${n}" ${ui.prio === String(n) ? 'selected' : ''}>${PRIORITES[n].e} ${PRIORITES[n].label}</option>`).join('')}</select>
  ${!isAdmin() ? `<label class="toggle"><input type="checkbox" id="f-mine" ${ui.onlyMine ? 'checked' : ''}><span>Seulement mes tâches</span></label>` : ''}
  <label class="toggle"><input type="checkbox" id="f-hide" ${ui.hideDone ? 'checked' : ''}><span>Masquer les terminées</span></label>
 </div>`;
}
const noResult = () => `<div class="panel"><p class="hint">Aucune tâche ne correspond à ces filtres. <button class="link" data-act="clear-filters">Tout afficher</button></p></div>`;

/* ---------- Accueil ---------- */
function taskRow(t) {
  const cat = catById(t.type), p = pct(t), st = status(t);
  return `<li><button class="trow st-${st}" data-act="open-task" data-id="${esc(t.id)}">
  <span class="ttile" title="${esc(cat.label)}">${emo(cat.emoji)}</span>
  <span class="tmain"><span class="ttitle">${esc(t.title)}</span>
   <span class="tmeta">${t.priority === 1 || t.priority === 2 ? `<span class="prio p${t.priority}" title="Priorité ${prio(t).label.toLowerCase()}">${emo(prio(t).e)}${prio(t).court}</span>` : ''}<span class="date">Fin ${fmt(t.end)}</span>${who(t)}${badge(t)}${t.comments ? `<span class="cmt" title="${plural(t.comments, 'commentaire')}">${emo('💬')}${t.comments}</span>` : ''}</span>
   <span class="bar"><span style="width:${p}%"></span></span></span>
  <span class="tpct">${p}<small>%</small></span></button></li>`;
}
function homeStats(tasks) {
  const open = tasks.filter(t => status(t) !== 'done');
  const soon = tasks.filter(t => status(t) === 'soon').length, late = tasks.filter(t => status(t) === 'late').length;
  // Un clic sur un compteur n'affiche que ces tâches ; un second clic annule.
  const stat = (id, e, n, label) => `<button class="stat ${ui.statusFilter === id ? 'on' : ''}" data-act="stat-filter" data-id="${id}" aria-pressed="${ui.statusFilter === id}" title="${ui.statusFilter === id ? 'Tout afficher' : 'N\'afficher que celles-ci'}">${emo(e)}<b>${n}</b>${label}</button>`;
  return stat('open', '📌', open.length, 'en cours') + stat('soon', '⚠️', soon, 'sous 7 jours') + stat('late', '🚨', late, 'en retard');
}
function homeResults() {
  const me = cur(), admin = isAdmin(), tasks = visibleTasks();
  const order = { late: 0, soon: 1, ok: 2, done: 3 };
  const groups = visibleGroups(tasks);
  if (!groups.length && filtersActive()) return noResult();
  return `<div class="groups">${groups.map((g, gi) => {
    // Terminées en bas ; sinon la plus prioritaire d'abord, puis en retard / bientôt, puis la date de fin.
    const list = tasks.filter(t => t.groupId === g.id).sort((a, b) =>
      (status(a) === 'done') - (status(b) === 'done') || (a.priority || 3) - (b.priority || 3) || order[status(a)] - order[status(b)] || a.end.localeCompare(b.end));
    const shared = isShared(g);
    const canAdd = !!g.canCreate;
    const hidden = ui.hideDone ? S.tasks.filter(t => t.groupId === g.id && status(t) === 'done').length : 0;
    const move = (n, dir, label) => n ? `<button class="icon-btn small" data-act="grp-move" data-id="${esc(g.id)}" data-with="${esc(n.id)}" aria-label="${label} ${esc(g.name)}" title="${label}">${ic(dir)}</button>` : '';
    const ordre = admin && !filtersActive() && groups.length > 1 ? `<span class="gmove">${move(groups[gi - 1], 'left', 'Placer avant')}${move(groups[gi + 1], 'right', 'Placer après')}</span>` : '';
    return `<article class="gcard ${list.length >= 5 ? 'wide' : ''}" style="--g:${esc(g.color)}">
    <header class="gcard-h"><span class="gtile ${g.icon.startsWith('img:') ? 'img' : ''}">${gIcon(g.icon, g.name)}</span>
     <div class="gtitle"><h2>${groupName(g)}</h2><span class="gsub">${avStack(g.members || [])}${shared ? '<span class="commun">Commun</span>' : ''}<span>${plural(list.length, 'tâche')}</span>${hidden ? `<span title="Tâches terminées masquées">+ ${hidden} terminée${hidden > 1 ? 's' : ''}</span>` : ''}</span></div>
     ${ordre}${canAdd ? `<button class="icon-btn" data-act="new-task-in" data-g="${esc(g.id)}" aria-label="Ajouter une tâche dans ${esc(g.name)}">${ic('plus')}</button>` : ''}</header>
    <ul class="tlist">${list.length ? list.map(taskRow).join('') : `<li class="empty">Aucune tâche ici. ${canAdd ? `<button class="link" data-act="new-task-in" data-g="${esc(g.id)}">Ajouter une tâche</button>` : ''}</li>`}</ul></article>`;
  }).join('') || `<div class="panel"><p class="hint">${admin ? 'Aucun groupe pour l\'instant. Ajoutez d\'abord les comptes de l\'équipe (onglet « Compte »), puis créez un groupe depuis l\'onglet « Groupe ».' : 'Vous ne faites partie d\'aucun groupe pour l\'instant. Créez-en un depuis l\'onglet « Groupe ».'}</p></div>`}</div>`;
}
function vHome() {
  const admin = isAdmin();
  return `${admin && S.defaultAdminPassword ? `<p class="warnbox" style="margin-bottom:16px">${emo('🔑')} Le mot de passe administrateur est encore « admin ». <button class="link" data-act="nav" data-v="account">Le changer maintenant</button></p>` : ''}
  <section class="page-head"><div><p class="eyebrow">${admin ? 'Vue globale' : 'Mes tâches'}</p><h1>Projets en cours</h1></div>
  <div class="stats" id="stats">${homeStats(visibleTasks({ ignoreDone: true }))}</div></section>
  ${admin ? filterBar() : ''}${toolbar()}
  <div id="results">${homeResults()}</div>`;
}

/* ---------- Timeline ---------- */
function timelineResults() {
  let tasks = visibleTasks();
  const groups0 = visibleGroups(tasks).filter(g => tasks.some(t => t.groupId === g.id));
  if (ui.tlGroup !== 'all') tasks = tasks.filter(t => t.groupId === ui.tlGroup);
  const tabs = `<div class="tabs" role="tablist"><button class="tab ${ui.tlGroup === 'all' ? 'on' : ''}" data-act="tl-group" data-id="all">Tous</button>${groups0.map(g => `<button class="tab ${ui.tlGroup === g.id ? 'on' : ''}" data-act="tl-group" data-id="${esc(g.id)}">${gIcon(g.icon, '')}${groupName(g)}</button>`).join('')}</div>`;
  if (!tasks.length) return tabs + (filtersActive() ? noResult() : `<div class="panel"><p class="hint">Aucune tâche à afficher pour ce filtre.</p></div>`);
  const t0 = iso(today());
  const min = tasks.reduce((m, t) => t.start < m ? t.start : m, t0), max = tasks.reduce((m, t) => t.end > m ? t.end : m, t0);
  let start = addD(-3, min); const dow = (pd(start).getDay() + 6) % 7; start = addD(-dow, start);
  const end = addD(10, max), N = diffD(start, end) + 1, DPD = 24, W = N * DPD;
  let rows = '';
  sortGroups(S.groups).filter(g => tasks.some(t => t.groupId === g.id)).forEach(g => {
    rows += `<div class="tl-row tl-ghead" style="--g:${esc(g.color)}"><div class="tl-lab">${gIcon(g.icon, '')}${groupName(g)}</div><div class="tl-track"></div></div>`;
    tasks.filter(t => t.groupId === g.id).sort((a, b) => a.start.localeCompare(b.start)).forEach(t => {
      const p = pct(t), st = status(t), left = diffD(start, t.start) * DPD, w = Math.max(1, diffD(t.start, t.end) + 1) * DPD;
      const owner = t.ownerId ? `<span class="av" title="${esc(userById(t.ownerId).name)}">${ini(userById(t.ownerId))}</span>` : `<span title="Tout le groupe">${emo('👥')}</span>`;
      rows += `<div class="tl-row" style="--g:${esc(g.color)}"><div class="tl-lab" title="${esc(t.title)}">${t.priority === 1 || t.priority === 2 ? `<span title="Priorité ${prio(t).label.toLowerCase()}">${emo(prio(t).e)}</span>` : ''}${emo(catById(t.type).emoji)}<span class="nm">${esc(t.title)}</span>${owner}</div>
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
  return tabs + `<div class="tl-wrap" id="tl-wrap"><div class="tl" style="--W:${W}px;--dpd:${DPD}px">${rows}
  <div class="tl-row tl-axis"><div class="tl-lab">Dates</div><div class="tl-track">${ticks}</div></div>
  <div class="today" data-x="${tx}" style="left:calc(var(--lab) + ${tx}px)"><span>Auj.</span></div></div></div>
  <div class="legend"><span><i style="background:var(--steel)"></i>Partie remplie = % d'étapes cochées</span><span><i style="background:var(--ok)"></i>Terminé</span><span><i style="box-shadow:0 0 0 2px var(--err)"></i>En retard</span><span>${emo('👥')} Tâche commune au groupe</span></div>`;
}
function vTimeline() {
  const admin = isAdmin();
  return `<section class="page-head"><div><p class="eyebrow">${admin ? 'Vue globale' : 'Mes tâches'}</p><h1>Timeline</h1></div></section>
  ${admin ? filterBar() : ''}${toolbar()}<div id="results">${timelineResults()}</div>`;
}

/* ---------- + Tâche (création, modification, duplication) ---------- */
function stepRow(s) {
  return `<li class="sed" data-sid="${s && s.id ? esc(s.id) : ''}" data-done="${s && s.done ? 1 : 0}"><div class="sed-f"><input type="text" class="s-label" maxlength="300" placeholder="Étape (ex. : valider le plan)" value="${esc(s ? s.label : '')}" aria-label="Nom de l'étape"><input type="text" class="s-desc" maxlength="2000" placeholder="Description (facultatif)" value="${esc(s ? s.desc : '')}" aria-label="Description de l'étape"></div>
  <div class="sed-btns"><button type="button" class="del" data-act="draft-up" aria-label="Monter l'étape">${ic('up')}</button><button type="button" class="del" data-act="draft-down" aria-label="Descendre l'étape">${ic('down')}</button><button type="button" class="del" data-act="draft-del-step" aria-label="Retirer l'étape">${ic('trash')}</button></div></li>`;
}
function ownerOptions(gid, selected) {
  const g = groupById(gid), me = cur();
  const ids = (g.members || []).filter(id => userById(id).active || id === selected);
  if (!isAdmin() && !ids.includes(me.id)) ids.push(me.id);
  if (selected && !ids.includes(selected)) ids.push(selected);
  const opts = [];
  if (isShared(g)) opts.push(`<option value="" ${!selected ? 'selected' : ''}>👥 Tout le groupe (tâche commune)</option>`);
  ids.forEach(id => opts.push(`<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(userById(id).name)}${userById(id).active ? '' : ' (désactivé)'}</option>`));
  if (!ids.length) opts.push(`<option value="">Aucun membre dans ce groupe</option>`);
  return opts.join('');
}
const catOption = (c, checked) => `<label><input type="radio" name="f-type" value="${esc(c.id)}" ${checked ? 'checked' : ''}><span class="opt">${emo(c.emoji)}${esc(c.label)}</span></label>`;
function vNewTask() {
  const me = cur();
  const src = ui.editId ? S.tasks.find(x => x.id === ui.editId) : (ui.dupFrom ? S.tasks.find(x => x.id === ui.dupFrom) : null);
  const t = ui.editId ? src : null;   // tâche modifiée
  const dup = !t && src ? src : null; // tâche dupliquée
  let groups = writableGroups();
  if (src && !groups.some(x => x.id === src.groupId)) groups = [groupById(src.groupId), ...groups];
  const g = src ? src.groupId : (ui.presetGroup && groups.some(x => x.id === ui.presetGroup) ? ui.presetGroup : groups[0]?.id);
  if (!g) return `<section class="form-page"><p class="eyebrow">Nouvelle tâche</p><h1>Créer une tâche</h1><div class="panel"><p class="hint">Créez d'abord un groupe pour y ranger la tâche.</p><div class="actions"><button class="btn primary" data-act="nav" data-v="newGroup">Créer un groupe</button></div></div></section>`;
  let o = src ? src.ownerId : (isShared(groupById(g)) && isAdmin() ? null : me.id);
  if (!src && isAdmin() && !isShared(groupById(g))) o = groupById(g).members?.[0] || null;
  const visibleCats = S.categories.filter(c => !c.hidden);
  const ty = src ? src.type : (visibleCats[0]?.id || 'devis');
  const cats = src && catById(ty).hidden ? [catById(ty), ...visibleCats] : visibleCats;
  const steps = src && src.steps.length ? src.steps.map(s => dup ? { label: s.label, desc: s.desc } : s) : [null, null];
  const title = t ? 'Modifier la tâche' : dup ? 'Dupliquer la tâche' : 'Nouvelle tâche';
  return `<section class="form-page"><p class="eyebrow">${title}</p><h1>${t ? esc(t.title) : dup ? 'Copie de « ' + esc(dup.title) + ' »' : 'Créer une tâche'}</h1>
 <form id="task-form" class="panel form" novalidate>
  <label class="field"><span>Titre</span><input type="text" id="f-title" maxlength="200" required value="${esc(t ? t.title : dup ? dup.title + ' (copie)' : '')}" placeholder="Ex. : Devis pondoirs – élevage Martin"></label>
  <div class="row2"><label class="field"><span>Groupe</span><select id="f-group">${groups.map(x => `<option value="${esc(x.id)}" ${x.id === g ? 'selected' : ''}>${groupName(x)}${isShared(x) ? ' (commun)' : ''}</option>`).join('')}</select></label>
  <label class="field"><span>Pour qui</span><select id="f-owner">${ownerOptions(g, o)}</select></label></div>
  <fieldset class="field"><legend>Catégorie</legend><div class="pick" id="cat-pick">${cats.map(c => catOption(c, c.id === ty)).join('')}</div>
   <div class="cat-add" id="cat-add" hidden>
    <select id="nc-emoji" aria-label="Pictogramme">${CAT_EMOJIS.map(e => `<option>${e}</option>`).join('')}</select>
    <input type="text" id="nc-label" maxlength="40" placeholder="Nom de la nouvelle catégorie" aria-label="Nom de la nouvelle catégorie">
    <button type="button" class="btn primary sm" data-act="cat-add-save">Ajouter</button><button type="button" class="btn sm" data-act="cat-add-cancel">Annuler</button>
   </div>
   <p class="hint"><button type="button" class="link" data-act="cat-add-open">+ Nouvelle catégorie</button> · <button type="button" class="link" data-act="nav" data-v="categories">Gérer les catégories</button></p></fieldset>
  <fieldset class="field"><legend>Priorité</legend><div class="pick">${[1, 2, 3, 4].map(n => `<label><input type="radio" name="f-prio" value="${n}" ${(src ? (src.priority || 3) : 3) === n ? 'checked' : ''}><span class="opt">${emo(PRIORITES[n].e)}${PRIORITES[n].label}</span></label>`).join('')}</div></fieldset>
  <div class="row2"><label class="field"><span>Début</span><input type="date" id="f-start" value="${src ? src.start : iso(today())}"></label>
  <label class="field"><span>Fin</span><input type="date" id="f-end" value="${src ? src.end : addD(14)}"></label></div>
  <label class="field"><span>Description</span><textarea id="f-desc" maxlength="5000" placeholder="Contexte, client, points d'attention">${esc(src ? src.desc : '')}</textarea></label>
  <fieldset class="field"><legend>Étapes</legend><ol class="steps-ed" id="steps-ed">${steps.map(stepRow).join('')}</ol>
   <div><button type="button" class="btn sm" data-act="draft-add-step">${ic('plus', 'sm')}Ajouter une étape</button></div>
   <p class="hint">L'avancement de la tâche se calcule à partir des étapes cochées. Sans étape, on la marque « terminée » depuis sa fiche.</p></fieldset>
  <div class="actions"><button type="button" class="btn" data-act="cancel-form">Annuler</button><button class="btn primary">${t ? 'Enregistrer' : 'Créer la tâche'}</button></div>
 </form></section>`;
}

/* ---------- + Groupe ---------- */
function vNewGroup() {
  const me = cur(), admin = isAdmin(), g = ui.editGroup ? S.groups.find(x => x.id === ui.editGroup) : null;
  const roles = g ? (g.roles || {}) : (admin ? {} : { [me.id]: 'responsable' });
  const members = Object.keys(roles);
  const icon = g ? g.icon : '🐔', color = g ? g.color : GROUP_COLORS[2];
  const editable = myGroups();
  const icons = GROUP_ICONS.includes(icon) ? GROUP_ICONS : [...GROUP_ICONS, icon];
  const colors = GROUP_COLORS.includes(color) ? GROUP_COLORS : [...GROUP_COLORS, color];
  // Personnes proposées : comptes actifs + membres actuels désactivés (pour pouvoir les retirer).
  const candidates = S.users.filter(u => u.role !== 'admin' && (u.active || members.includes(u.id)));
  const roleSel = (id, role, lock) => `<select name="g-role" data-for="${esc(id)}" aria-label="Rôle dans le groupe" ${lock ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<section class="form-page"><p class="eyebrow">${g ? 'Modifier le groupe' : 'Nouveau groupe'}</p><h1>${g ? esc(g.name) : 'Créer un groupe'}</h1>
 <form id="group-form" class="panel form" novalidate>
  <label class="field"><span>Nom du groupe</span><input type="text" id="g-name" maxlength="80" required value="${esc(g ? g.name : '')}" placeholder="Ex. : Salon 2027"></label>
  <fieldset class="field"><legend>Membres et rôles</legend><ul class="mem-list">${candidates.map(u => {
    const on = members.includes(u.id), lock = !admin && u.id === me.id;
    return `<li><label><input type="checkbox" name="g-mem" value="${esc(u.id)}" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''}><span class="opt"><span class="av">${ini(u)}</span>${esc(u.name)}${lock ? ' (vous)' : ''}${u.active ? '' : ' (désactivé)'}</span></label>${roleSel(u.id, roles[u.id] || 'membre', lock)}</li>`;
  }).join('') || '<li><p class="hint">Aucun compte utilisateur pour l\'instant : ajoutez l\'équipe depuis l\'onglet « Compte ».</p></li>'}</ul>
   <p class="hint"><b>Responsable</b> : gère le groupe, modifie et supprime toutes ses tâches, restaure la corbeille. <b>Membre</b> : crée des tâches, coche les étapes, commente, modifie les tâches qui le concernent. <b>Lecteur</b> : consulte seulement. Un groupe a toujours au moins un responsable.
   Avec deux membres ou plus, le groupe est commun ; avec un seul, il reste privé.</p></fieldset>
  <fieldset class="field"><legend>Logo</legend><div class="pick">${icons.map(x => `<label><input type="radio" name="g-icon" value="${esc(x)}" ${x === icon ? 'checked' : ''} aria-label="Logo ${x.startsWith('img:') ? (x === 'img:lr' ? 'Le Roy' : 'LLC') : esc(x)}"><span class="opt tile">${gIcon(x, '')}</span></label>`).join('')}</div></fieldset>
  <fieldset class="field"><legend>Couleur</legend><div class="pick">${colors.map((c, i) => `<label><input type="radio" name="g-color" value="${esc(c)}" ${c === color ? 'checked' : ''} aria-label="Couleur ${i + 1}"><span class="swatch" style="--c:${esc(c)}"></span></label>`).join('')}</div></fieldset>
  <div class="actions"><button type="button" class="btn" data-act="cancel-form">Annuler</button><button class="btn primary">${g ? 'Enregistrer' : 'Créer le groupe'}</button></div>
 </form>
 <div class="panel" style="margin-top:16px"><h3>Groupes existants</h3><ul class="glist">${editable.map((x, i) => {
    const n = S.tasks.filter(t => t.groupId === x.id).length;
    const fleches = admin ? `<button class="del" data-act="grp-move" data-id="${esc(x.id)}" data-dir="-1" aria-label="Monter ${esc(x.name)}" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="del" data-act="grp-move" data-id="${esc(x.id)}" data-dir="1" aria-label="Descendre ${esc(x.name)}" ${i === editable.length - 1 ? 'disabled' : ''}>${ic('down')}</button>` : '';
    return `<li><span class="gtile ${x.icon.startsWith('img:') ? 'img' : ''}" style="--g:${esc(x.color)}">${gIcon(x.icon, '')}</span><b>${groupName(x)}</b><span class="rolechip">${esc(ROLES[x.myRole] || 'Administrateur')}</span>${avStack(x.members || [])}<span class="hint">${plural(n, 'tâche')}</span>
  ${fleches}${x.canEdit ? `<button class="del" data-act="edit-group" data-id="${esc(x.id)}" aria-label="Modifier ${esc(x.name)}">${ic('edit')}</button>${n ? '' : `<button class="del" data-act="del-group" data-id="${esc(x.id)}" aria-label="Mettre ${esc(x.name)} à la corbeille" title="Mettre à la corbeille">${ic('trash')}</button>`}` : ''}</li>`;
  }).join('') || '<li class="hint">Aucun groupe pour l\'instant.</li>'}</ul>
  <p class="hint" style="margin-top:10px">Un groupe ne peut être supprimé que s'il ne contient plus de tâche ; il va alors à la corbeille, d'où il peut être restauré.${admin ? ' Les flèches ↑ ↓ changent l\'ordre des groupes sur l\'accueil et la timeline, pour tout le monde.' : ''}</p></div></section>`;
}

/* ---------- Catégories ---------- */
function vCategories() {
  const admin = isAdmin();
  const cats = S.categories;
  const row = (c, i) => {
    const n = c.count || 0;
    if (ui.editCat === c.id) {
      return `<li class="cat-edit"><form class="cat-form" data-id="${esc(c.id)}">
      <input type="text" name="emoji" class="emoji-in" maxlength="16" value="${esc(c.emoji)}" aria-label="Pictogramme">
      <input type="text" name="label" maxlength="40" value="${esc(c.label)}" aria-label="Nom" required>
      <button class="btn primary sm">Enregistrer</button><button type="button" class="btn sm" data-act="cat-edit-cancel">Annuler</button></form></li>`;
    }
    const others = cats.filter(x => x.id !== c.id && !x.hidden);
    return `<li class="${c.hidden ? 'is-hidden' : ''}"><span class="gtile cat-tile">${emo(c.emoji)}</span><b>${esc(c.label)}</b>
    ${c.hidden ? '<span class="rolechip">Masquée</span>' : ''}<span class="hint">${plural(n, 'tâche')}</span>
    ${admin ? `<span class="row-btns">
     <button class="del" data-act="cat-move" data-id="${esc(c.id)}" data-dir="-1" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
     <button class="del" data-act="cat-move" data-id="${esc(c.id)}" data-dir="1" aria-label="Descendre" ${i === cats.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
     <button class="del" data-act="cat-edit" data-id="${esc(c.id)}" aria-label="Modifier ${esc(c.label)}">${ic('edit')}</button>
     <button class="del" data-act="cat-hide" data-id="${esc(c.id)}" aria-label="${c.hidden ? 'Afficher' : 'Masquer'} ${esc(c.label)}" title="${c.hidden ? 'Afficher à nouveau' : 'Masquer (ne sera plus proposée)'}">${ic(c.hidden ? 'eye' : 'eyeoff')}</button>
     <button class="del" data-act="cat-del" data-id="${esc(c.id)}" aria-label="Supprimer ${esc(c.label)}">${ic('trash')}</button>
    </span>` : ''}
    ${ui.catDel === c.id && n ? `<form class="cat-del-form" data-id="${esc(c.id)}"><span>Ses ${plural(n, 'tâche')} iront dans :</span>
      <select name="remplacer">${others.map(x => `<option value="${esc(x.id)}">${esc(x.emoji)} ${esc(x.label)}</option>`).join('')}</select>
      <button class="btn danger armed sm">Supprimer</button><button type="button" class="btn sm" data-act="cat-del-cancel">Annuler</button></form>` : ''}</li>`;
  };
  return `<section class="form-page"><p class="eyebrow">Réglages</p><h1>Catégories</h1>
  <form id="cat-new" class="panel form"><h3>Nouvelle catégorie</h3>
   <label class="field"><span>Nom</span><input type="text" id="cn-label" maxlength="40" required placeholder="Ex. : SAV, Livraison, Formation…"></label>
   <fieldset class="field"><legend>Pictogramme</legend><div class="pick">${CAT_EMOJIS.map((e, i) => `<label><input type="radio" name="cn-emoji" value="${e}" ${i === 8 ? 'checked' : ''} aria-label="${e}"><span class="opt tile">${emo(e)}</span></label>`).join('')}</div>
    <label class="field" style="max-width:260px"><span>Ou tapez un autre emoji</span><input type="text" id="cn-emoji-free" maxlength="16" placeholder="Ex. : 🐓"></label></fieldset>
   <div class="actions"><button class="btn primary">Créer la catégorie</button></div></form>
  <div class="panel" style="margin-top:16px"><h3>Catégories existantes</h3><ul class="glist cat-list">${cats.map(row).join('')}</ul>
   <p class="hint" style="margin-top:10px">Une catégorie masquée n'est plus proposée pour les nouvelles tâches, mais les anciennes la gardent.
   ${admin ? 'Une catégorie utilisée peut être supprimée : ses tâches sont alors déplacées dans une autre catégorie.' : 'Tout le monde peut proposer une nouvelle catégorie ; seul l\'administrateur les modifie, les masque, les réordonne ou les supprime.'}</p></div></section>`;
}

/* ---------- Compte ---------- */
function vAccount() {
  const me = cur(), admin = me.role === 'admin';
  const mine = admin ? (S.taskCounts[me.id] || 0) : S.tasks.filter(t => t.ownerId === me.id).length;
  const theme = pref.get('theme', 'auto');
  return `<section class="acc"><div><p class="eyebrow">Compte</p><h1 style="font-size:34px">Mon compte</h1></div>
 <div class="panel acc-id"><span class="av">${ini(me)}</span><div><h2>${esc(me.name)}</h2><p>${admin ? 'Administrateur · voit et attribue les tâches de toute l\'équipe' : 'Utilisateur · voit ses tâches et celles de ses groupes'} · ${plural(mine, 'tâche')} à son nom</p></div>
  <button class="btn" data-act="logout">${ic('logout', 'sm')}Se déconnecter</button></div>
 ${vAcces()}
 <form id="pwd-form" class="panel form"><h3>Changer de mot de passe</h3>
  <p class="hint">12 caractères minimum : une phrase facile à retenir convient très bien. Évitez votre nom, « leroy » et les mots courants.</p>
  <div class="row2"><label class="field"><span>Mot de passe actuel</span><input type="password" id="p-old" autocomplete="current-password"></label>
  <label class="field"><span>Nouveau mot de passe</span><input type="password" id="p-new" autocomplete="new-password" minlength="12"></label></div>
  ${ui.pwdErr ? `<p class="err">${esc(ui.pwdErr)}</p>` : ''}
  <div class="actions"><button class="btn primary">Mettre à jour</button></div></form>
 <div class="panel"><h3>Affichage</h3><div class="pick" role="radiogroup" aria-label="Thème">
  ${[['auto', '🖥️', 'Comme l\'ordinateur'], ['light', '☀️', 'Clair'], ['dark', '🌙', 'Sombre']].map(([v, e, l]) => `<label><input type="radio" name="theme" value="${v}" ${theme === v ? 'checked' : ''}><span class="opt">${emo(e)}${l}</span></label>`).join('')}
 </div></div>
 ${admin ? vSecurite() : ''}
 ${admin ? vTeam() : ''}
 ${vClaude()}
 <div class="panel"><h3>Données</h3>
  <div class="data-btns"><button class="btn" data-act="export-csv">${ic('download', 'sm')}Exporter les tâches (Excel)</button></div>
  <p class="hint" style="margin-top:10px">L'export contient les tâches que vous voyez, avec leur avancement.</p>
  ${admin ? `<form id="backup-form" class="form" style="margin-top:14px"><h4>Sauvegarde complète (administrateur)</h4>
   <p class="hint">Télécharge toute la base dans un fichier compressé (.sql.gz) à garder en lieu sûr. Retapez votre mot de passe pour confirmer : ce fichier contient toutes les données.</p>
   <div class="inline-key"><input type="password" id="bk-pwd" placeholder="Votre mot de passe" autocomplete="current-password" required aria-label="Votre mot de passe"><button class="btn sm">${ic('download', 'sm')}Télécharger la sauvegarde</button></div></form>` : ''}</div>
 <p class="hint version">Projets Le Roy · version ${esc(S.version || '')}</p>
 </section>`;
}
// QR code de l'adresse du site, dessiné directement dans le navigateur.
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
// Adresse de connexion + QR code, pour ouvrir l'application sur un autre appareil.
function vAcces() {
  const url = location.origin;
  return `<div class="panel"><h3>${emo('📱')} Se connecter depuis un autre appareil</h3><div class="acces">
    <div class="acces-qr" role="img" aria-label="QR code de l'adresse de connexion">${qrSvg(url)}</div>
    <div class="acces-txt">
      <p class="hint">Adresse de l'application (à ouvrir depuis n'importe quel appareil connecté à Internet) :</p>
      <code id="acces-url">${esc(url)}</code>
      <div class="data-btns"><button class="btn sm primary" data-act="copy" data-target="acces-url">Copier l'adresse</button>
      <a class="btn sm" href="/acces.html" target="_blank" rel="noopener">${ic('download', 'sm')}Fiche à imprimer</a></div>
      <p class="hint">Sur un téléphone ou une tablette : ouvrez l'appareil photo et visez le QR code.</p>
    </div></div></div>`;
}
function vSecurite() {
  const x = ui.sec, b = ui.backups;
  if (!x) return `<div class="panel"><h3>${emo('🛡️')} Sécurité</h3><p class="hint">Chargement…</p></div>`;
  const nv = { critique: ['🚨', 'err'], important: ['⚠️', 'warnbox'], info: ['ℹ️', 'hint'] };
  const al = x.alertes.length ? x.alertes.map(a => `<p class="${nv[a.niveau][1]}">${emo(nv[a.niveau][0])} ${esc(a.texte)}</p>`).join('') : `<p class="hint">${emo('✅')} Aucun point de vigilance.</p>`;
  const sch = x.schema;
  return `<div class="panel"><h3>${emo('🛡️')} Sécurité et sauvegardes</h3>${al}
  <ul class="team keys">
   <li><b>Base de données</b><span class="meta">version ${sch.version} sur ${sch.target} — ${sch.state === 'ok' ? 'à jour' : esc(sch.state)}</span><span></span><span></span></li>
   <li><b>Dernière sauvegarde</b><span class="meta">${x.sauvegarde.dernierOk ? esc(x.sauvegarde.dernierOk) + ' · ' + (x.sauvegarde.chiffree ? 'chiffrée' : 'non chiffrée') : 'aucune'}</span><span></span><span></span></li>
   <li><b>Sessions ouvertes</b><span class="meta">${x.sessions} · échecs de connexion sur 24 h : ${x.echecs24h}</span><span></span><span></span></li>
  </ul>
  <label class="toggle"><input type="checkbox" id="liste-comptes" ${x.listeComptes ? 'checked' : ''}><span>Afficher la liste des comptes sur l'écran de connexion (désactivé par défaut : chacun tape son nom)</span></label>
  ${b && b.sauvegardes.length ? `<details class="history"><summary>Sauvegardes conservées sur l'hébergement (${b.sauvegardes.length})</summary><ul>${b.sauvegardes.map(f => `<li><span class="h-when">${esc(f.date || '')}</span><span>${esc(f.raison || '')} · ${f.chiffree ? 'chiffrée' : 'non chiffrée'} · ${f.verifiee ? 'vérifiée' : 'non vérifiée'} · ${Math.round((f.octets || 0) / 1024)} Ko</span></li>`).join('')}</ul></details>` : ''}
  ${ui.adminKeys && ui.adminKeys.length ? `<details class="history"><summary>Clés d'accès de toute l'équipe (${ui.adminKeys.length})</summary><ul class="keys-admin">${ui.adminKeys.map(k => `<li><span class="h-when">${esc(k.userName)}</span><span>${esc(k.name)} · ${esc(k.prefix || '')}… · ${k.scope === 'lecture' ? 'lecture' : 'écriture'}${k.lastUsed ? ' · vue ' + fmtStamp(k.lastUsed) : ''} <button class="btn sm danger" data-act="admin-key-revoke" data-id="${esc(k.id)}">Révoquer</button></span></li>`).join('')}</ul></details>` : ''}
  <p class="hint">Journal complet des opérations sensibles : onglet « Journal ». Sauvegardes chiffrées vers le serveur interne : voir docs/sauvegardes.md.</p></div>`;
}
function vTeam() {
  const rows = S.users.map(u => {
    const n = S.taskCounts[u.id] || 0;
    if (ui.editUser === u.id) {
      return `<li class="team-edit"><form id="user-edit" class="form" data-id="${esc(u.id)}">
       <div class="inline3">
        <label class="field"><span>Nom</span><input type="text" name="name" maxlength="60" required value="${esc(u.name)}"></label>
        <label class="field"><span>Adresse e-mail</span><input type="email" name="email" maxlength="190" value="${esc(u.email || '')}" placeholder="(facultative)"></label>
        <label class="field"><span>Rôle</span><select name="role" ${u.id === S.me ? 'disabled' : ''}><option value="user" ${u.role === 'user' ? 'selected' : ''}>Utilisateur</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option></select></label>
        <span></span></div>
       <div class="inline-key"><input type="text" name="password" id="ue-pwd" placeholder="Nouveau mot de passe provisoire (laisser vide = inchangé)" autocomplete="off"><button type="button" class="btn sm" data-act="gen-pwd" data-target="ue-pwd">Générer</button></div>
       <p class="hint">Avec un nouveau mot de passe, ${esc(u.name)} sera déconnecté(e) partout et devra en choisir un autre à sa prochaine connexion. Communiquez-le de vive voix ou par message privé.</p>
       <label class="toggle"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${u.id === S.me ? 'disabled' : ''}><span>Compte actif (peut se connecter)</span></label>
       <div class="actions"><button type="button" class="btn sm" data-act="user-logout" data-id="${esc(u.id)}">Déconnecter de tous ses appareils</button><button type="button" class="btn sm" data-act="user-edit-cancel">Annuler</button><button class="btn primary sm">Enregistrer</button></div></form></li>`;
    }
    return `<li class="${u.active ? '' : 'is-hidden'}"><span class="av">${ini(u)}</span><b>${esc(u.name)}</b><span class="meta">${plural(n, 'tâche')}</span>
     <span class="rolechip ${u.active ? u.role : ''}">${!u.active ? 'Désactivé' : u.role === 'admin' ? 'Admin' : 'Utilisateur'}</span>
     <button class="del" data-act="user-edit" data-id="${esc(u.id)}" aria-label="Modifier ${esc(u.name)}">${ic('edit')}</button></li>`;
  }).join('');
  return `<div class="panel"><h3>Équipe</h3><ul class="team">${rows}</ul>
  <form id="user-form" class="inline3"><label class="field"><span>Nom</span><input type="text" id="n-name" maxlength="60" required></label>
  <label class="field"><span>Mot de passe provisoire</span><input type="text" id="n-pwd" required minlength="12" placeholder="12 caractères minimum" autocomplete="off"></label>
  <label class="field"><span>Rôle</span><select id="n-role"><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></label>
  <span><button type="button" class="btn sm" data-act="gen-pwd" data-target="n-pwd">Générer</button> <button class="btn primary">Ajouter</button></span></form>
  <p class="hint" style="margin-top:10px">Chaque nouvel utilisateur reçoit son groupe privé « Perso » et doit choisir son propre mot de passe à sa première connexion. Le crayon permet de renommer, de réinitialiser le mot de passe (en cas d'oubli), de déconnecter ses appareils ou de désactiver un compte : il ne pourra plus se connecter mais ses tâches restent.</p></div>`;
}
function vClaude() {
  const keys = ui.keys || [];
  const cx = S.connecteur || { actif: false };
  const site = location.origin;
  const exp = k => k.expiresAt ? 'expire le ' + fmtStamp(k.expiresAt).replace(/ \d\d:\d\d$/, '') : '';
  return `<div class="panel"><h3>${emo('🤖')} Lier à Claude ou ChatGPT</h3>
  <p class="note">Une clé d'accès permet à un assistant (Claude ou ChatGPT) de lire et de faire avancer <b>vos</b> tâches : « Quelles sont mes tâches en retard ? », « Crée un devis pour l'élevage Martin avec ces étapes… ». La clé a les mêmes droits que votre compte, ne peut <b>rien supprimer</b>, et expire (vous choisissez la durée). Elle voyage dans un <b>en-tête sécurisé</b>, jamais dans une adresse.</p>
  ${cx.actif ? '' : `<p class="warnbox">${emo('🔒')} Le connecteur en ligne est désactivé : l'administrateur doit l'activer (en bas de cette section) avant de pouvoir l'utiliser.</p>`}
  ${ui.newKey ? `<div class="keybox"><p><b>Votre nouvelle clé</b> (elle ne sera plus affichée : copiez-la maintenant, ne la partagez avec personne) :</p>
    <code id="new-key">${esc(ui.newKey)}</code>
    <div class="data-btns"><button class="btn primary sm" data-act="copy" data-target="new-key">Copier la clé</button></div>
    <p class="hint"><b>${emo('🟠')} Claude Desktop (recommandé)</b> — la clé reste sur votre ordinateur : double-cliquez sur <b>lier-a-claude.bat</b> (voir docs/lier-a-claude.md), adresse du site : <b>${esc(site)}</b>.</p>
    <p class="hint"><b>${emo('🟢')} Connecteur en ligne</b> (outils qui savent envoyer un en-tête) — adresse : <b>${esc(site)}/mcp</b>, en-tête <b>Authorization: Bearer</b> suivi de la clé. Si votre outil ne permet pas d'ajouter d'en-tête, utilisez la méthode locale ci-dessus : une clé n'est jamais acceptée dans l'adresse.</p></div>` : ''}
  ${keys.length ? `<ul class="team keys">${keys.map(k => `<li>${ic('key')}<b>${esc(k.name)}</b><span class="meta">${esc(k.prefix || '')}… · ${k.scope === 'lecture' ? 'lecture seule' : 'lecture et écriture'} · ${exp(k)}${k.lastUsed ? ' · utilisée ' + fmtStamp(k.lastUsed) : ' · jamais utilisée'}</span><span></span><button class="del" data-act="key-del" data-id="${esc(k.id)}" aria-label="Supprimer la clé ${esc(k.name)}">${ic('trash')}</button></li>`).join('')}</ul>` : ''}
  <form id="key-form" class="inline-key"><input type="text" id="k-name" maxlength="60" value="Claude" aria-label="Nom de la clé">
   <select id="k-scope" aria-label="Droits"><option value="ecriture">Lecture et écriture</option><option value="lecture">Lecture seule</option></select>
   <select id="k-days" aria-label="Durée"><option value="30">30 jours</option><option value="90" selected>90 jours</option><option value="365">1 an</option></select>
   <button class="btn sm">${ic('key', 'sm')}Créer une clé d'accès</button></form>
  ${isAdmin() ? `<div class="connecteur ${cx.actif ? 'on' : ''}"><h4>${emo('🌐')} Connecteur en ligne Claude / ChatGPT (administrateur)</h4>
   <p class="hint">Quand il est activé, les personnes qui ont une clé d'accès peuvent relier un assistant à leurs tâches. Seuls les outils de tâches sont ouverts (jamais les pages de l'application), uniquement avec une clé personnelle, et rien ne peut être supprimé. Désactivé, plus personne ne peut s'en servir. Vous pouvez révoquer n'importe quelle clé dans « Sécurité ».</p>
   <div class="data-btns"><span class="rolechip ${cx.actif ? 'admin' : ''}">${cx.actif ? 'Activé' : 'Désactivé'}</span>
   <button class="btn sm ${cx.actif ? '' : 'primary'}" data-act="connecteur" data-on="${cx.actif ? 0 : 1}">${cx.actif ? 'Désactiver' : 'Activer le connecteur'}</button></div></div>` : ''}
  </div>`;
}

/* ---------- Historique des tâches terminées (administrateur) ---------- */
// Horodatage serveur (UTC) → « 22/10/2026 14:05 »
function stampFr(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function histFiltre() {
  const list = (ui.hist && ui.hist.tasks) || [];
  if (!ui.histQ) return list;
  const words = norm(ui.histQ).split(/\s+/).filter(Boolean);
  return list.filter(t => {
    const h = norm([t.title, t.desc, t.group.name, catById(t.type).label, t.ownerId ? userById(t.ownerId).name : '', t.doneBy ? userById(t.doneBy).name : '',
      ...t.steps.map(s => s.label + ' ' + (s.doneBy ? userById(s.doneBy).name : ''))].join(' '));
    return words.every(w => h.includes(w));
  });
}
function histListe() {
  const list = histFiltre();
  if (!ui.hist) return '<li class="hint none">Chargement…</li>';
  if (!list.length) return `<li class="hint none">${ui.hist.tasks.length ? 'Aucune tâche terminée ne correspond à cette recherche.' : 'Aucune tâche terminée pour l\'instant.'}</li>`;
  return list.map(t => {
    const cat = catById(t.type);
    return `<li><details><summary>
      <span class="h-date">${esc(stampFr(t.doneAt))}</span>
      <span class="h-titre">${emo(cat.emoji)}<b>${esc(t.title)}</b></span>
      <span class="h-grp">${gIcon(t.group.icon, '')}${esc(t.group.name)}</span>
      <span class="h-qui">Validée par <b>${t.doneBy ? esc(userById(t.doneBy).name) : '—'}</b></span>
      ${t.archived ? '<span class="rolechip">Archivée</span>' : '<span class="rolechip admin">Encore affichée</span>'}
    </summary>
    <div class="h-detail">
      <p class="hint">Pour : ${t.ownerId ? esc(userById(t.ownerId).name) : 'Tout le groupe'} · du ${fmt(t.start)} au ${fmt(t.end)} · ${esc(cat.label)}</p>
      ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ''}
      ${t.steps.length ? `<ol class="h-steps">${t.steps.map(s => `<li><span>${esc(s.label)}</span><span class="qui">${s.done ? `${ic('check', 'sm')}${s.doneBy ? esc(userById(s.doneBy).name) : '—'}${s.doneAt ? ' · ' + esc(stampFr(s.doneAt)) : ''}` : 'non cochée'}</span></li>`).join('')}</ol>` : '<p class="hint">Tâche sans étapes.</p>'}
    </div></details></li>`;
  }).join('');
}
function vHistorique() {
  if (!isAdmin()) return '<div class="panel"><p class="hint">Réservé à l\'administrateur.</p></div>';
  const n = ui.hist ? ui.hist.tasks.length : 0;
  return `<section class="page-head"><div><p class="eyebrow">Administrateur</p><h1>Historique des tâches terminées</h1></div>
   <div class="stats"><span class="stat">${emo('✅')}<b>${n}</b>terminée${n > 1 ? 's' : ''}</span></div></section>
  <p class="note" style="margin-bottom:14px">Une tâche terminée reste affichée ${S.archiveJours || 7} jours sur l'accueil et la timeline, puis elle n'apparaît plus qu'ici. Cliquez sur une ligne pour voir ses étapes, qui les a validées et quand.</p>
  <div class="toolbar">
   <label class="searchbox">${ic('search')}<input type="search" id="h-q" value="${esc(ui.histQ)}" placeholder="Rechercher (tâche, client, personne…)" aria-label="Rechercher dans l'historique"></label>
   <button class="btn sm" data-act="hist-csv">${ic('download', 'sm')}Exporter (Excel)</button>
  </div>
  ${ui.hist && ui.hist.error ? `<p class="err">${esc(ui.hist.error)}</p>` : ''}
  <ul class="hist" id="hist-list">${histListe()}</ul>`;
}

/* ---------- Corbeille ---------- */
function vCorbeille() {
  const d = ui.trash, admin = isAdmin();
  if (!d) return `<section class="form-page"><p class="eyebrow">Corbeille</p><h1>Éléments supprimés</h1><div class="panel"><p class="hint">Chargement…</p></div></section>`;
  const qui = id => id ? esc(userById(id).name) : '—';
  const ligne = (kind, x, titre, sous) => `<li><span class="gtile cat-tile">${emo(kind === 'tache' ? '📄' : '📁')}</span><div class="trash-t"><b>${titre}</b><span class="hint">${sous} · supprimé par ${qui(x.deletedBy)} le ${esc(stampFr(x.deletedAt))} · ${x.joursRestants} jour${x.joursRestants > 1 ? 's' : ''} avant suppression définitive</span></div>
    <span class="row-btns"><button class="btn sm" data-act="trash-restore" data-kind="${kind}" data-id="${esc(x.id)}">Restaurer</button>${admin ? `<button class="btn sm danger" data-act="trash-purge" data-kind="${kind}" data-id="${esc(x.id)}">${ui.purgeArm === kind + x.id ? 'Confirmer : supprimer pour toujours' : 'Supprimer définitivement'}</button>` : ''}</span></li>`;
  return `<section class="form-page"><p class="eyebrow">Corbeille</p><h1>Éléments supprimés</h1>
  <div class="panel"><p class="hint">Une tâche ou un groupe supprimé reste ici ${d.jours} jours : avec ses étapes, ses commentaires et son historique, il peut être restauré tel quel. ${admin ? 'Seul l\'administrateur peut supprimer définitivement.' : 'Vous voyez les éléments de vos groupes dont vous êtes responsable.'}</p></div>
  <div class="panel" style="margin-top:16px"><h3>Tâches</h3><ul class="glist trash">${d.tasks.map(t => ligne('tache', t, esc(t.title), esc(t.group) + (t.groupDeleted ? ' (groupe aussi supprimé)' : ''))).join('') || '<li class="hint">Aucune tâche supprimée.</li>'}</ul></div>
  <div class="panel" style="margin-top:16px"><h3>Groupes</h3><ul class="glist trash">${d.groups.map(g => ligne('groupe', g, esc(g.name), 'groupe')).join('') || '<li class="hint">Aucun groupe supprimé.</li>'}</ul></div></section>`;
}

/* ---------- Journal des opérations sensibles (administrateur) ---------- */
const AUDIT_FAMILLES = [['', 'Tout'], ['connexion', 'Connexions'], ['compte', 'Comptes'], ['mot_de_passe', 'Mots de passe'], ['cle', 'Clés d\'accès'], ['tache', 'Tâches'], ['groupe', 'Groupes'], ['sauvegarde', 'Sauvegardes'], ['migration', 'Mises à jour'], ['connecteur', 'Connecteur']];
function vJournal() {
  const d = ui.audit;
  const lib = a => ({ 'connexion.ok': 'Connexion', 'connexion.echec': 'Connexion refusée', 'connexion.bloquee': 'Compte bloqué (essais répétés)', 'deconnexion': 'Déconnexion', 'compte.cree': 'Compte créé', 'compte.modifie': 'Compte modifié', 'compte.mot_de_passe_reinitialise': 'Mot de passe réinitialisé', 'compte.deconnecte': 'Appareils déconnectés',
    'mot_de_passe.change': 'Mot de passe changé', 'mot_de_passe.echec': 'Changement de mot de passe refusé', 'cle.creee': 'Clé d\'accès créée', 'cle.supprimee': 'Clé supprimée', 'cle.revoquee': 'Clé révoquée', 'tache.supprimee': 'Tâche mise à la corbeille', 'tache.restauree': 'Tâche restaurée', 'tache.purgee': 'Tâche supprimée définitivement',
    'groupe.cree': 'Groupe créé', 'groupe.modifie': 'Groupe modifié', 'groupe.supprime': 'Groupe mis à la corbeille', 'groupe.restaure': 'Groupe restauré', 'groupe.purge': 'Groupe supprimé définitivement', 'sauvegarde.ok': 'Sauvegarde automatique', 'sauvegarde.echec': 'ÉCHEC de sauvegarde', 'sauvegarde.telechargee': 'Sauvegarde téléchargée', 'sauvegarde.refusee': 'Téléchargement de sauvegarde refusé',
    'migration.ok': 'Base mise à jour', 'migration.echec': 'ÉCHEC de mise à jour', 'connecteur.active': 'Connecteur activé', 'connecteur.desactive': 'Connecteur désactivé', 'installation.admin_cree': 'Installation : administrateur créé', 'categorie.creee': 'Catégorie créée', 'categorie.modifiee': 'Catégorie modifiée', 'categorie.supprimee': 'Catégorie supprimée' })[a] || a;
  return `<section class="form-page"><p class="eyebrow">Sécurité</p><h1>Journal des opérations sensibles</h1>
  <div class="panel"><p class="hint">Ce journal ne peut ni être modifié ni être effacé depuis l'application. Il ne contient jamais de mot de passe ni de clé.</p>
  <form id="audit-form" class="inline-key"><select id="au-action" aria-label="Type d'opération">${AUDIT_FAMILLES.map(([v, l]) => `<option value="${v}" ${ui.auditAction === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <input type="search" id="au-q" placeholder="Rechercher (nom, détail)" value="${esc(ui.auditQ)}" aria-label="Rechercher"><button class="btn sm">Filtrer</button></form></div>
  <div class="panel" style="margin-top:16px">${!d ? '<p class="hint">Chargement…</p>' : `<ul class="audit">${d.events.map(e => `<li class="${/echec|bloquee|refusee|purg/.test(e.action) ? 'bad' : ''}"><span class="h-when">${esc(stampFr(e.at))}</span><span><b>${esc(lib(e.action))}</b> · ${esc(e.userName || '—')}${e.ip ? ' · <span class="mono small">' + esc(e.ip) + '</span>' : ''}${e.detail ? '<br><span class="hint">' + esc(e.detail) + '</span>' : ''}</span></li>`).join('') || '<li class="hint">Rien à afficher.</li>'}</ul>
   ${d.events.length >= 100 ? '<div class="actions"><button class="btn sm" data-act="audit-more">Voir plus ancien</button></div>' : ''}`}</div></section>`;
}
