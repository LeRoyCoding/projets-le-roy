// Affichage général, clics, formulaires, temps réel et démarrage.
'use strict';

const VIEWS = { notifs: vNotifs, direction: vDirection, mustChange: vMustChange, corbeille: vCorbeille, journal: vJournal, login: vLogin, home: vHome, timeline: vTimeline, newTask: vNewTask, newGroup: vNewGroup, categories: vCategories, historique: vHistorique, account: vAccount };

function render() {
  if (S && S.mustChange) {   // mot de passe provisoire : rien d'autre n'est accessible
    $('#hdr').innerHTML = `<div class="brandbar"><div class="wrap"><div class="logo"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span><span class="app">Projets</span></div></div></div>`;
    $('#main').innerHTML = vMustChange(); $('#modal').hidden = true; return;
  }
  const me = cur(); if (!me) ui.view = 'login'; else if (ui.view === 'login') ui.view = 'home';
  const v = ui.view;
  const tabs = [['home', 'Accueil'], ['timeline', 'Timeline'], ['newTask', 'Tâche', 1], ['newGroup', 'Groupe', 1], ['categories', 'Catégories'],
    ...(me && canManageTrash() ? [['corbeille', 'Corbeille' + (S.corbeille ? ' (' + S.corbeille + ')' : '')]] : []),
    ...(me && me.role === 'admin' ? [['direction', 'Direction'], ['historique', 'Historique'], ['journal', 'Journal']] : []), ['account', 'Compte']];
  const editing = (v === 'newTask' && (ui.editId || ui.dupFrom)) || (v === 'newGroup' && ui.editGroup);
  $('#hdr').innerHTML = `${S && S.env && S.env !== 'production' ? '<div class="envbar">ENVIRONNEMENT DE TEST — les données ici ne sont pas les vraies</div>' : ''}<div class="brandbar"><div class="wrap"><div class="logo"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span><span class="app">Projets</span></div>
  ${me ? `<button class="bell ${S.alertes && (S.alertes.retard || S.alertes.nonLues) ? 'on' : ''}" data-act="nav" data-v="notifs" aria-label="À surveiller : ${S.alertes ? S.alertes.retard + ' en retard, ' + S.alertes.nonLues + ' notification(s) non lue(s)' : ''}" title="À surveiller">${emo('🔔')}${S.alertes && (S.alertes.retard + S.alertes.nonLues) ? `<span class="badge-n ${S.alertes.retard ? 'late' : ''}">${S.alertes.retard + S.alertes.nonLues}</span>` : ''}</button><button class="me" data-act="nav" data-v="account"><span class="av">${ini(me)}</span><span class="nm">${esc(me.name)}</span>${me.role === 'admin' ? '<span class="role-tag">Admin</span>' : ''}</button>` : ''}</div></div>
  ${me ? `<div class="tabsbar"><div class="wrap"><nav aria-label="Navigation principale">${tabs.map(([id, l, p]) => `<button data-act="nav" data-v="${id}" ${v === id && !editing ? 'aria-current="page"' : ''}>${p ? '<span class="plus">+</span>' : ''}${l}</button>`).join('')}</nav></div></div>` : ''}`;
  document.body.classList.toggle('env-test', !!(S && S.env && S.env !== 'production'));
  const tlScroll = $('#tl-wrap')?.scrollLeft;
  $('#main').innerHTML = VIEWS[v]();
  if (v === 'timeline') placeTimeline(tlScroll);
  renderModal();
}
// Ne réaffiche que les résultats (la zone de recherche garde le curseur).
function renderResults() {
  if (ui.view === 'home') {
    $('#results').innerHTML = homeResults(); $('#stats').innerHTML = homeStats(visibleTasks({ ignoreDone: true }));
    const q = $('#q'); if (q && q.value !== ui.search && document.activeElement !== q) q.value = ui.search;
  }
  else if (ui.view === 'timeline') { const x = $('#tl-wrap')?.scrollLeft; $('#results').innerHTML = timelineResults(); placeTimeline(x); }
}
// Timeline : on garde la position, ou on centre « aujourd'hui » à l'ouverture.
function placeTimeline(prev) {
  const w = $('#tl-wrap'); if (!w) return;
  if (prev !== undefined && prev !== null) { w.scrollLeft = prev; return; }
  const x = Number($('.today')?.dataset.x || 0);
  w.scrollLeft = Math.max(0, x - w.clientWidth / 3);
}
function go(v, keep) {
  ui.view = v; ui.pwdErr = ''; ui.editUser = null; ui.editCat = null; ui.catDel = null;
  if (!keep) { ui.editId = null; ui.dupFrom = null; ui.editGroup = null; ui.presetGroup = null; }
  if (v !== 'account') ui.newKey = null;
  if (v === 'account') { loadKeys(); if (isAdmin()) loadSecurite(); }
  if (v === 'corbeille') loadTrash();
  if (v === 'notifs') loadNotifs();
  if (v === 'direction') { ui.direction = null; loadDirection(); }
  if (v === 'journal') { ui.audit = null; loadAudit(); }
  if (v === 'historique') loadHistorique();
  render(); window.scrollTo(0, 0);
}
function openTask(id) {
  ui.openTask = id; ui.confirmDel = false; ui.details = null; ui.historyOpen = false;
  renderModal(); loadDetails().then(renderModal);
}
function closeTask() { ui.openTask = null; ui.details = null; renderModal(); }

// Lance une modification, recharge les données et réaffiche. Affiche l'erreur s'il y en a une.
async function act(fn, okMsg) {
  if (ui.busy) return false;
  ui.busy = true;
  try { await fn(); await refresh(); if (ui.openTask) await loadDetails(); render(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(e.message); return false; }
  finally { ui.busy = false; }
}
async function loadHistorique() {
  try { ui.hist = await api('GET', '/api/historique'); } catch (e) { ui.hist = { tasks: [], error: e.message }; }
  if (ui.view === 'historique') render();
}
function exportHistoriqueCsv() {
  const cell = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = histFiltre().map(t => [stampFr(t.doneAt), t.title, t.group.name, catById(t.type).label, t.ownerId ? userById(t.ownerId).name : 'Tout le groupe',
    t.doneBy ? userById(t.doneBy).name : '—', t.steps.length, t.archived ? 'Archivée' : 'Encore affichée']);
  const csv = '\ufeff' + [['Terminée le', 'Tâche', 'Groupe', 'Catégorie', 'Pour qui', 'Validée par', 'Étapes', 'État'], ...rows].map(r => r.map(cell).join(';')).join('\r\n');
  downloadFile(`historique-taches-${iso(today())}.csv`, csv, 'text/csv;charset=utf-8');
}
async function loadSecurite() {
  try { const [s, b, k] = await Promise.all([api('GET', '/api/securite'), api('GET', '/api/sauvegardes'), api('GET', '/api/securite/cles')]); ui.sec = s; ui.backups = b; ui.adminKeys = k.tokens; }
  catch { /* sans importance */ }
  if (ui.view === 'account') render();
}
async function loadNotifs() {
  try { ui.notifs = await api('GET', '/api/notifications'); } catch (e) { ui.notifs = { notifications: [], retard: [], bientot: [], unread: 0 }; toast(e.message); }
  if (ui.view === 'notifs') render();
}
async function loadDirection() {
  try { ui.direction = await api('GET', '/api/direction'); } catch (e) { toast(e.message); }
  if (ui.view === 'direction') render();
}
async function loadTrash() {
  try { ui.trash = await api('GET', '/api/corbeille'); } catch (e) { ui.trash = { tasks: [], groups: [], jours: 90 }; toast(e.message); }
  if (ui.view === 'corbeille') render();
}
async function loadAudit(more) {
  try {
    const q = new URLSearchParams({ limite: '100' });
    if (ui.auditAction) q.set('action', ui.auditAction);
    if (ui.auditQ) q.set('q', ui.auditQ);
    if (more && ui.audit && ui.audit.events.length) q.set('avant', ui.audit.events[ui.audit.events.length - 1].id);
    const r = await api('GET', '/api/audit?' + q);
    ui.audit = more && ui.audit ? { events: [...ui.audit.events, ...r.events] } : r;
  } catch (e) { ui.audit = { events: [] }; toast(e.message); }
  if (ui.view === 'journal') render();
}
// Mot de passe provisoire aléatoire, facile à dicter : 4 groupes de 4 caractères sans ambiguïté (pas de 0/O, 1/l/I).
function genPwd() {
  const alpha = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint32Array(16);
  crypto.getRandomValues(r);
  return [...r].map(n => alpha[n % alpha.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
async function loadKeys() {
  try { ui.keys = (await api('GET', '/api/tokens')).tokens; if (ui.view === 'account') render(); } catch { /* sans importance */ }
}

/* ---------- Mises à jour : chacun voit les changements des autres ----------
   L'hébergement ne permet pas de connexion permanente : toutes les 5 secondes, l'application demande
   au serveur « y a-t-il eu des changements ? » (une toute petite requête) et se rafraîchit si oui. */
let pollT = null, lastRev = null, wasDown = false, liveT, pollBusy = false;
async function poll() {
  if (document.hidden || pollBusy || !S) return;
  pollBusy = true;
  try {
    const { rev } = await api('GET', '/api/rev');
    $('#offline').hidden = true;
    if (wasDown) { wasDown = false; liveUpdate(); }
    else if (lastRev !== null && rev !== lastRev) liveUpdate();
    lastRev = rev;
  } catch (e) {
    if (S) { wasDown = true; $('#offline').hidden = false; }
  } finally { pollBusy = false; }
}
function startEvents() {
  if (pollT) return;
  lastRev = null; wasDown = false;
  poll();
  pollT = setInterval(poll, 5000);
}
function stopEvents() { clearInterval(pollT); pollT = null; lastRev = null; $('#offline').hidden = true; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && pollT) poll(); });
function liveUpdate() {
  clearTimeout(liveT);
  liveT = setTimeout(async () => {
    if (!S) return;
    try { await refresh(); if (ui.openTask) await loadDetails(); } catch { return; }
    if (ui.view === 'historique') loadHistorique();
    // Pas de réaffichage complet pendant une saisie, pour ne pas effacer ce qui est en cours d'écriture.
    const a = document.activeElement;
    const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !$('#modal').contains(a) && a.id !== 'q';
    const formView = ['newTask', 'newGroup', 'account', 'categories'].includes(ui.view);
    if (!formView && !typing) {
      if (a && a.id === 'q') renderResults(); else render();
      renderModal();
    } else renderModal();
  }, 150);
}
onUnauthorized = async () => { S = null; stopEvents(); await loadLogin(); render(); };

/* ---------- Export Excel (CSV) ---------- */
function exportCsv() {
  const cell = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const frDate = s => s.split('-').reverse().join('/');
  const head = ['Groupe', 'Catégorie', 'Priorité', 'Titre', 'Pour qui', 'Créée par', 'Début', 'Fin', 'Avancement (%)', 'Statut', 'Étapes faites', 'Étapes au total', 'Description'];
  const rows = visibleTasks({ ignoreDone: true }).map(t => {
    const g = groupById(t.groupId);
    return [isAdmin() && !isShared(g) && g.members?.length ? g.name + ' · ' + userById(g.members[0]).name : g.name,
      catById(t.type).label, prio(t).label, t.title, t.ownerId ? userById(t.ownerId).name : 'Tout le groupe', t.createdBy ? userById(t.createdBy).name : '', frDate(t.start), frDate(t.end),
      pct(t), statusLabel(t), t.steps.filter(s => s.done).length, t.steps.length, t.desc];
  });
  const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
  downloadFile(`taches-le-roy-${iso(today())}.csv`, csv, 'text/csv;charset=utf-8');
  toast(plural(rows.length, 'tâche exportée', 'tâches exportées'));
}

function copyText(id) {
  const el = document.getElementById(id); if (!el) return;
  const text = el.textContent;
  const done = () => toast('Copié');
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, () => fallback()); return; }
  fallback();
  function fallback() {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('Sélectionnez le texte puis Ctrl+C'); }
    ta.remove();
  }
}

/* ---------- Clics ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id, t = S && S.tasks.find(x => x.id === ui.openTask);
  switch (a) {
    case 'pick-user': ui.loginUser = id; ui.loginErr = ''; render(); setTimeout(() => $('#l-pwd')?.focus(), 0); break;
    case 'nav': ui.openTask = null; ui.details = null; go(b.dataset.v); break;
    case 'new-task-in': ui.editId = null; ui.dupFrom = null; ui.editGroup = null; ui.presetGroup = b.dataset.g; ui.openTask = null; go('newTask', true); break;
    case 'open-task': openTask(id); break;
    case 'close-modal': closeTask(); break;
    case 'toggle-step': {
      // Affichage immédiat (utile sur tablette), puis enregistrement ; retour en arrière en cas d'erreur.
      const s = t && t.steps.find(x => x.id === b.dataset.s); if (!s) break;
      const wasDone = pct(t) === 100;
      s.done = !s.done;
      s.doneBy = s.done ? S.me : null; s.doneAt = s.done ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
      // La tâche vient d'être terminée (ou rouverte) : affichage immédiat de « Terminée par… ».
      if (!wasDone && pct(t) === 100) { t.doneBy = S.me; t.doneAt = s.doneAt; }
      if (wasDone && pct(t) < 100) { t.doneBy = null; t.doneAt = null; }
      render();
      if (!wasDone && pct(t) === 100) toast('Tâche terminée 🎉');
      try { await api('PATCH', '/api/steps/' + s.id, { done: s.done }); }
      catch (err) { s.done = !s.done; s.doneBy = null; s.doneAt = null; render(); toast(err.message); }
      break;
    }
    case 'toggle-completed':
      if (!t) break;
      await act(() => api('PATCH', '/api/tasks/' + t.id + '/terminee', { completed: !t.completed }), t.completed ? 'Tâche rouverte' : 'Tâche terminée 🎉');
      break;
    case 'del-step': await act(() => api('DELETE', '/api/steps/' + b.dataset.s)); break;
    case 'del-comment': await act(() => api('DELETE', '/api/comments/' + id), 'Commentaire supprimé'); break;
    case 'edit-task': if (!t) break; ui.editId = t.id; ui.dupFrom = null; ui.openTask = null; go('newTask', true); break;
    case 'dup-task': if (!t) break; ui.dupFrom = t.id; ui.editId = null; ui.openTask = null; go('newTask', true); break;
    case 'del-task':
      if (!t) break;
      if (!ui.confirmDel) { ui.confirmDel = true; renderModal(); break; }
      ui.confirmDel = false;
      await act(async () => { await api('DELETE', '/api/tasks/' + t.id); ui.openTask = null; ui.details = null; }, 'Tâche mise à la corbeille (récupérable pendant 90 jours)');
      break;
    case 'filter-user': if (id === 'all') ui.filter = []; else { ui.filter = ui.filter.includes(id) ? ui.filter.filter(x => x !== id) : [...ui.filter, id]; } render(); break;
    case 'stat-filter': ui.statusFilter = ui.statusFilter === id ? null : id; renderResults(); break;
    case 'clear-filters': ui.statusFilter = null; ui.prio = ''; ui.search = ''; ui.cat = ''; ui.filter = []; ui.onlyMine = false; pref.set('onlyMine', false); ui.hideDone = false; pref.set('hideDone', false); render(); break;
    case 'tl-group': ui.tlGroup = id; renderResults(); break;
    // Formulaire de tâche
    case 'draft-add-step': { const ol = $('#steps-ed'); ol.insertAdjacentHTML('beforeend', stepRow(null)); ol.lastElementChild.querySelector('.s-label').focus(); break; }
    case 'draft-del-step': b.closest('.sed').remove(); break;
    case 'draft-up': case 'draft-down': {
      const li = b.closest('.sed');
      const other = a === 'draft-up' ? li.previousElementSibling : li.nextElementSibling;
      if (other) { if (a === 'draft-up') other.before(li); else other.after(li); b.focus(); }
      break;
    }
    case 'cat-add-open': $('#cat-add').hidden = false; $('#nc-label').focus(); break;
    case 'cat-add-cancel': $('#cat-add').hidden = true; break;
    case 'cat-add-save': {
      const label = $('#nc-label').value.trim(), emoji = $('#nc-emoji').value;
      if (!label) { $('#nc-label').focus(); break; }
      try {
        const r = await api('POST', '/api/categories', { label, emoji });
        S.categories.push({ id: r.id, label, emoji, hidden: false, count: 0 });
        $('#cat-pick').insertAdjacentHTML('beforeend', catOption({ id: r.id, label, emoji }, true));
        $('#cat-add').hidden = true; $('#nc-label').value = '';
        toast('Catégorie « ' + label + ' » créée');
      } catch (err) { toast(err.message); }
      break;
    }
    case 'cancel-form': go('home'); break;
    // Groupes
    case 'edit-group': ui.editGroup = id; go('newGroup', true); break;
    case 'del-group':
      await act(async () => { await api('DELETE', '/api/groups/' + id); if (ui.tlGroup === id) ui.tlGroup = 'all'; if (ui.editGroup === id) ui.editGroup = null; }, 'Groupe mis à la corbeille');
      break;
    // Catégories
    case 'cat-edit': ui.editCat = id; ui.catDel = null; render(); $('.cat-form input[name=label]')?.focus(); break;
    case 'cat-edit-cancel': ui.editCat = null; render(); break;
    case 'cat-hide': {
      const c = catById(id);
      await act(() => api('PUT', '/api/categories/' + id, { label: c.label, emoji: c.emoji, hidden: !c.hidden }), c.hidden ? 'Catégorie affichée' : 'Catégorie masquée');
      break;
    }
    case 'grp-move': {
      const ids = S.groups.map(g => g.id), i = ids.indexOf(id), j = b.dataset.with ? ids.indexOf(b.dataset.with) : i + Number(b.dataset.dir);
      if (i < 0 || j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await act(() => api('POST', '/api/groups/ordre', { ids }));
      break;
    }
    case 'hist-csv': exportHistoriqueCsv(); break;
    case 'cat-move': {
      const ids = S.categories.map(c => c.id), i = ids.indexOf(id), j = i + Number(b.dataset.dir);
      if (j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await act(() => api('POST', '/api/categories/ordre', { ids }));
      break;
    }
    case 'cat-del': {
      const c = catById(id);
      if (c.count) { ui.catDel = id; ui.editCat = null; render(); break; }
      await act(() => api('DELETE', '/api/categories/' + id), 'Catégorie supprimée');
      break;
    }
    case 'cat-del-cancel': ui.catDel = null; render(); break;
    // Compte
    case 'user-edit': ui.editUser = id; render(); break;
    case 'user-edit-cancel': ui.editUser = null; render(); break;
    case 'export-csv': exportCsv(); break;
    case 'copy': copyText(b.dataset.target); break;
    case 'connecteur': {
      const on = b.dataset.on === '1';
      await act(() => api('POST', '/api/connecteur', { actif: on }), on ? 'Connecteur activé' : 'Connecteur désactivé');
      break;
    }
    case 'key-del': if (await act(() => api('DELETE', '/api/tokens/' + id), 'Clé supprimée')) loadKeys(); break;
    case 'gen-pwd': { const el = document.getElementById(b.dataset.target); if (el) { el.value = genPwd(); el.type = 'text'; el.focus(); el.select(); } break; }
    case 'user-logout': await act(() => api('POST', '/api/securite/deconnecter/' + id, {}), 'Appareils déconnectés'); break;
    case 'trash-restore': await act(() => api('POST', '/api/corbeille/' + b.dataset.kind + '/' + id + '/restaurer', {}), 'Restauré'); loadTrash(); break;
    case 'trash-purge':
      if (ui.purgeArm !== b.dataset.kind + id) { ui.purgeArm = b.dataset.kind + id; render(); break; }
      ui.purgeArm = null;
      await act(() => api('DELETE', '/api/corbeille/' + b.dataset.kind + '/' + id), 'Supprimé définitivement'); loadTrash(); break;
    case 'admin-key-revoke': if (await act(() => api('DELETE', '/api/securite/cles/' + id), 'Clé révoquée')) loadSecurite(); break;
    case 'audit-more': loadAudit(true); break;
    case 'notifs-read': await api('POST', '/api/notifications/lues', {}); await refresh(); await loadNotifs(); render(); break;
    case 'logout':
      try { await api('POST', '/api/logout', {}); } catch { /* on déconnecte quand même l'écran */ }
      S = null; stopEvents(); ui.loginUser = null; ui.openTask = null; ui.details = null; ui.filter = []; ui.tlGroup = 'all'; ui.search = ''; ui.cat = ''; ui.newKey = null; ui.keys = []; ui.sec = null; ui.backups = null; ui.adminKeys = null; ui.trash = null; ui.audit = null; ui.notifs = null; ui.direction = null; ui.pwdErr = '';
      await loadLogin(); render(); break;
  }
});

/* ---------- Changements dans les champs ---------- */
let searchT;
document.addEventListener('input', e => {
  if (e.target.id === 'q') { clearTimeout(searchT); searchT = setTimeout(() => { ui.search = e.target.value.trim(); renderResults(); }, 120); }
  if (e.target.id === 'h-q') { ui.histQ = e.target.value.trim(); $('#hist-list').innerHTML = histListe(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'f-group') { const g = groupById(el.value); $('#f-owner').innerHTML = ownerOptions(g.id, isShared(g) ? null : (g.members?.[0] || cur().id)); }
  if (el.id === 'f-cat') { ui.cat = el.value; renderResults(); }
  if (el.id === 'f-prio') { ui.prio = el.value; renderResults(); }
  if (el.id === 'f-hide') { ui.hideDone = el.checked; pref.set('hideDone', el.checked); renderResults(); }
  if (el.id === 'f-mine') { ui.onlyMine = el.checked; pref.set('onlyMine', el.checked); renderResults(); }
  if (el.id === 'liste-comptes') api('POST', '/api/securite/liste-comptes', { actif: el.checked }).then(() => toast(el.checked ? 'Liste des comptes affichée sur l\'écran de connexion' : 'Liste des comptes masquée')).catch(err => { toast(err.message); el.checked = !el.checked; });
  if (el.name === 'theme') { pref.set('theme', el.value); applyTheme(); }
  if (el.name === 'cn-emoji') { const f = $('#cn-emoji-free'); if (f) f.value = ''; }
});
document.addEventListener('toggle', e => { if (e.target.classList?.contains('history')) ui.historyOpen = e.target.open; }, true);

/* ---------- Formulaires ---------- */
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  // Empêche un double clic de créer deux fois la même chose.
  if (f.dataset.sending) return;
  f.dataset.sending = '1';
  try { await onSubmit(f); } finally { delete f.dataset.sending; }
});
function showErr(f, msg) {
  let p = f.querySelector('.err');
  if (!p) { p = document.createElement('p'); p.className = 'err'; (f.querySelector('.actions') || f.lastElementChild).before(p); }
  p.textContent = msg;
}
async function onSubmit(f) {
  if (f.id === 'login-form') {
    try {
      const nameEl = $('#l-name');
      await api('POST', '/api/login', nameEl ? { name: nameEl.value.trim(), password: $('#l-pwd').value } : { userId: ui.loginUser, password: $('#l-pwd').value });
      ui.loginErr = ''; ui.loginName = ''; ui.filter = []; ui.tlGroup = 'all';
      await refresh(); startEvents(); if (S.mustChange) { ui.pwdErr = ''; render(); } else go('home');
    } catch (err) { ui.loginErr = err.message; if ($('#l-name')) ui.loginName = $('#l-name').value; render(); ($('#l-pwd') || $('#l-name'))?.focus(); }
  }
  if (f.id === 'forced-pwd-form') {
    const o = $('#fp-old').value, n = $('#fp-new').value, n2 = $('#fp-new2').value;
    if (n !== n2) { ui.pwdErr = 'Les deux mots de passe ne sont pas identiques.'; render(); return; }
    try { await api('POST', '/api/password', { oldPassword: o, newPassword: n }); ui.pwdErr = ''; await refresh(); startEvents(); go('home'); toast('Mot de passe enregistré : bienvenue !'); }
    catch (err) { ui.pwdErr = err.message; render(); }
  }
  if (f.id === 'backup-form') {
    const pwd = $('#bk-pwd').value;
    try {
      const res = await fetch('/api/sauvegarde', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur ' + res.status); }
      downloadFile(`projets-le-roy-${iso(today())}.sql.gz`, await res.blob(), 'application/gzip');
      $('#bk-pwd').value = ''; toast('Sauvegarde téléchargée');
    } catch (err) { toast(err.message); }
  }
  if (f.id === 'prefs-form') {
    try { await api('PUT', '/api/moi', { email: $('#pf-email').value.trim(), notifyDaily: $('#pf-daily').checked }); await refresh(); render(); toast('Préférences enregistrées'); }
    catch (err) { toast(err.message); }
  }
  if (f.id === 'audit-form') { ui.auditAction = $('#au-action').value; ui.auditQ = $('#au-q').value.trim(); ui.audit = null; render(); loadAudit(); }
  if (f.id === 'task-form') {
    const title = $('#f-title').value.trim(), start = $('#f-start').value, end = $('#f-end').value;
    if (!title) return showErr(f, 'Donnez un titre à la tâche.');
    if (!start || !end) return showErr(f, 'Renseignez les dates de début et de fin.');
    if (end < start) return showErr(f, 'La date de fin doit être après la date de début.');
    const steps = [...f.querySelectorAll('.sed')].map(r => ({ id: r.dataset.sid || null, label: r.querySelector('.s-label').value.trim(), desc: r.querySelector('.s-desc').value.trim(), done: r.dataset.done === '1' })).filter(s => s.label);
    const data = { title, groupId: $('#f-group').value, ownerId: $('#f-owner').value || null, type: (f.querySelector('input[name=f-type]:checked') || {}).value,
      priority: Number((f.querySelector('input[name=f-prio]:checked') || {}).value || 3), start, end, desc: $('#f-desc').value.trim(), steps };
    const editId = ui.editId;
    const msg = editId ? 'Tâche enregistrée' : (data.ownerId && data.ownerId !== cur().id ? 'Tâche créée pour ' + userById(data.ownerId).name : 'Tâche créée');
    try {
      await api(editId ? 'PUT' : 'POST', editId ? '/api/tasks/' + editId : '/api/tasks', data);
      await refresh(); go('home'); toast(msg);
    } catch (err) { showErr(f, err.message); }
  }
  if (f.id === 'group-form') {
    const name = $('#g-name').value.trim(); if (!name) return showErr(f, 'Donnez un nom au groupe.');
    const roleOf = id => (f.querySelector(`select[name=g-role][data-for="${id}"]`) || {}).value || 'membre';
    const members = [...f.querySelectorAll('input[name=g-mem]')].filter(x => x.checked || x.disabled && x.defaultChecked).map(x => ({ id: x.value, role: roleOf(x.value) }));
    if (!isAdmin() && !members.some(m => m.id === cur().id)) members.unshift({ id: cur().id, role: 'responsable' });
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
    const desc = $('#ns-desc').value.trim();
    $('#ns-label').value = ''; $('#ns-desc').value = '';
    if (await act(() => api('POST', '/api/tasks/' + t.id + '/steps', { label: l, desc }))) $('#ns-label')?.focus();
    else { $('#ns-label').value = l; $('#ns-desc').value = desc; }
  }
  if (f.id === 'comment-form') {
    const t = S.tasks.find(x => x.id === ui.openTask), body = $('#c-body').value.trim(); if (!t || !body) return;
    $('#c-body').value = '';
    if (!await act(() => api('POST', '/api/tasks/' + t.id + '/comments', { body }))) $('#c-body').value = body;
    else $('#c-body')?.focus();
  }
  if (f.id === 'pwd-form') {
    const oldPassword = $('#p-old').value, newPassword = $('#p-new').value;
    if (newPassword.length < 12) { ui.pwdErr = 'Le nouveau mot de passe doit faire au moins 12 caractères (une phrase facile à retenir convient très bien).'; render(); return; }
    try {
      await api('POST', '/api/password', { oldPassword, newPassword });
      ui.pwdErr = ''; await refresh(); render(); toast('Mot de passe mis à jour');
    } catch (err) { ui.pwdErr = err.message; render(); }
  }
  if (f.id === 'user-form') {
    const n = $('#n-name').value.trim(), p = $('#n-pwd').value; if (!n || !p) return;
    if (await act(() => api('POST', '/api/users', { name: n, password: p, role: $('#n-role').value }), n + ' ajouté à l\'équipe')) alert('Mot de passe provisoire de ' + n + ' :\n\n' + p + '\n\nCommuniquez-le de vive voix ou par message privé. ' + n + ' devra en choisir un autre à sa première connexion.');
  }
  if (f.id === 'user-edit') {
    const fd = new FormData(f), body = { name: fd.get('name'), email: fd.get('email') || '' };
    if (!f.elements.role.disabled) body.role = fd.get('role');
    if (fd.get('password')) body.password = fd.get('password');
    if (!f.elements.active.disabled) body.active = f.elements.active.checked;
    try { await api('PUT', '/api/users/' + f.dataset.id, body); ui.editUser = null; await refresh(); render(); toast(body.password ? 'Compte enregistré — mot de passe provisoire : ' + body.password : 'Compte enregistré'); if (body.password) alert('Mot de passe provisoire de ' + body.name + ' :\n\n' + body.password + '\n\nCommuniquez-le de vive voix ou par message privé : il devra en choisir un autre à sa prochaine connexion.'); }
    catch (err) { showErr(f, err.message); }
  }
  if (f.id === 'cat-new') {
    const label = $('#cn-label').value.trim(); if (!label) return showErr(f, 'Donnez un nom à la catégorie.');
    const emoji = $('#cn-emoji-free').value.trim() || (f.querySelector('input[name=cn-emoji]:checked') || {}).value || '📁';
    try { await api('POST', '/api/categories', { label, emoji }); await refresh(); render(); toast('Catégorie « ' + label + ' » créée'); }
    catch (err) { showErr(f, err.message); }
  }
  if (f.classList.contains('cat-form')) {
    const fd = new FormData(f);
    const c = catById(f.dataset.id);
    try { await api('PUT', '/api/categories/' + f.dataset.id, { label: fd.get('label'), emoji: fd.get('emoji'), hidden: c.hidden }); ui.editCat = null; await refresh(); render(); toast('Catégorie enregistrée'); }
    catch (err) { toast(err.message); }
  }
  if (f.classList.contains('cat-del-form')) {
    const to = new FormData(f).get('remplacer');
    if (await act(() => api('DELETE', '/api/categories/' + f.dataset.id + '?remplacer=' + encodeURIComponent(to)), 'Catégorie supprimée, tâches déplacées')) ui.catDel = null;
  }
  if (f.id === 'key-form') {
    try {
      const r = await api('POST', '/api/tokens', { name: $('#k-name').value.trim() || 'Claude', scope: $('#k-scope').value, days: Number($('#k-days').value) });
      ui.newKey = r.token; await loadKeys(); render();
    } catch (err) { toast(err.message); }
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.openTask) closeTask();
  // « / » place le curseur dans la recherche
  if (e.key === '/' && !ui.openTask && $('#q') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) { e.preventDefault(); $('#q').focus(); }
});

/* ---------- Démarrage ---------- */
(async function init() {
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { await refresh(); startEvents(); }
  catch { S = null; if (!L) await loadLogin(); }
  render();
})();
