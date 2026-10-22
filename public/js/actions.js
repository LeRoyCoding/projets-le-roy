// Affichage général, clics, formulaires, temps réel et démarrage.
'use strict';

const VIEWS = { login: vLogin, home: vHome, timeline: vTimeline, newTask: vNewTask, newGroup: vNewGroup, categories: vCategories, account: vAccount };

function render() {
  const me = cur(); if (!me) ui.view = 'login'; else if (ui.view === 'login') ui.view = 'home';
  const v = ui.view;
  const tabs = [['home', 'Accueil'], ['timeline', 'Timeline'], ['newTask', 'Tâche', 1], ['newGroup', 'Groupe', 1], ['categories', 'Catégories'], ['account', 'Compte']];
  const editing = (v === 'newTask' && (ui.editId || ui.dupFrom)) || (v === 'newGroup' && ui.editGroup);
  $('#hdr').innerHTML = `<div class="brandbar"><div class="wrap"><div class="logo"><span class="logo-pill"><img src="${IMG.full}" alt="Le Roy – Lead Le Roy Concept"></span><span class="app">Projets</span></div>
  ${me ? `<button class="me" data-act="nav" data-v="account"><span class="av">${ini(me)}</span><span class="nm">${esc(me.name)}</span>${me.role === 'admin' ? '<span class="role-tag">Admin</span>' : ''}</button>` : ''}</div></div>
  ${me ? `<div class="tabsbar"><div class="wrap"><nav aria-label="Navigation principale">${tabs.map(([id, l, p]) => `<button data-act="nav" data-v="${id}" ${v === id && !editing ? 'aria-current="page"' : ''}>${p ? '<span class="plus">+</span>' : ''}${l}</button>`).join('')}</nav></div></div>` : ''}`;
  const tlScroll = $('#tl-wrap')?.scrollLeft;
  $('#main').innerHTML = VIEWS[v]();
  if (v === 'timeline') placeTimeline(tlScroll);
  renderModal();
}
// Ne réaffiche que les résultats (la zone de recherche garde le curseur).
function renderResults() {
  if (ui.view === 'home') { $('#results').innerHTML = homeResults(); $('#stats').innerHTML = homeStats(visibleTasks({ ignoreDone: true })); }
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
  if (v === 'account') loadKeys();
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
async function loadKeys() {
  try { ui.keys = (await api('GET', '/api/tokens')).tokens; if (ui.view === 'account') render(); } catch { /* sans importance */ }
}

/* ---------- Temps réel : chacun voit les changements des autres ---------- */
let es = null, wasDown = false, liveT;
function startEvents() {
  if (es || !window.EventSource) return;
  es = new EventSource('/api/events');
  es.addEventListener('change', () => liveUpdate());
  es.onopen = () => { $('#offline').hidden = true; if (wasDown) { wasDown = false; liveUpdate(); } };
  es.onerror = () => { wasDown = true; $('#offline').hidden = false; };
}
function stopEvents() { if (es) { es.close(); es = null; } $('#offline').hidden = true; }
function liveUpdate() {
  clearTimeout(liveT);
  liveT = setTimeout(async () => {
    if (!S) return;
    try { await refresh(); if (ui.openTask) await loadDetails(); } catch { return; }
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
  const head = ['Groupe', 'Catégorie', 'Titre', 'Pour qui', 'Début', 'Fin', 'Avancement (%)', 'Statut', 'Étapes faites', 'Étapes au total', 'Description'];
  const rows = visibleTasks({ ignoreDone: true }).map(t => {
    const g = groupById(t.groupId);
    return [isAdmin() && !isShared(g) && g.members?.length ? g.name + ' · ' + userById(g.members[0]).name : g.name,
      catById(t.type).label, t.title, t.ownerId ? userById(t.ownerId).name : 'Tout le groupe', frDate(t.start), frDate(t.end),
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
      s.done = !s.done; render();
      if (!wasDone && pct(t) === 100) toast('Tâche terminée 🎉');
      try { await api('PATCH', '/api/steps/' + s.id, { done: s.done }); }
      catch (err) { s.done = !s.done; render(); toast(err.message); }
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
      await act(async () => { await api('DELETE', '/api/tasks/' + t.id); ui.openTask = null; ui.details = null; }, 'Tâche supprimée');
      break;
    case 'filter-user': if (id === 'all') ui.filter = []; else { ui.filter = ui.filter.includes(id) ? ui.filter.filter(x => x !== id) : [...ui.filter, id]; } render(); break;
    case 'clear-filters': ui.search = ''; ui.cat = ''; ui.filter = []; ui.onlyMine = false; pref.set('onlyMine', false); ui.hideDone = false; pref.set('hideDone', false); render(); break;
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
      await act(async () => { await api('DELETE', '/api/groups/' + id); if (ui.tlGroup === id) ui.tlGroup = 'all'; if (ui.editGroup === id) ui.editGroup = null; }, 'Groupe supprimé');
      break;
    // Catégories
    case 'cat-edit': ui.editCat = id; ui.catDel = null; render(); $('.cat-form input[name=label]')?.focus(); break;
    case 'cat-edit-cancel': ui.editCat = null; render(); break;
    case 'cat-hide': {
      const c = catById(id);
      await act(() => api('PUT', '/api/categories/' + id, { label: c.label, emoji: c.emoji, hidden: !c.hidden }), c.hidden ? 'Catégorie affichée' : 'Catégorie masquée');
      break;
    }
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
    case 'key-del': if (await act(() => api('DELETE', '/api/tokens/' + id), 'Clé supprimée')) loadKeys(); break;
    case 'logout':
      try { await api('POST', '/api/logout', {}); } catch { /* on déconnecte quand même l'écran */ }
      S = null; stopEvents(); ui.loginUser = null; ui.openTask = null; ui.details = null; ui.filter = []; ui.tlGroup = 'all'; ui.search = ''; ui.cat = ''; ui.newKey = null; ui.keys = [];
      await loadLogin(); render(); break;
  }
});

/* ---------- Changements dans les champs ---------- */
let searchT;
document.addEventListener('input', e => {
  if (e.target.id === 'q') { clearTimeout(searchT); searchT = setTimeout(() => { ui.search = e.target.value.trim(); renderResults(); }, 120); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'f-group') { const g = groupById(el.value); $('#f-owner').innerHTML = ownerOptions(g.id, isShared(g) ? null : (g.members?.[0] || cur().id)); }
  if (el.id === 'f-cat') { ui.cat = el.value; renderResults(); }
  if (el.id === 'f-hide') { ui.hideDone = el.checked; pref.set('hideDone', el.checked); renderResults(); }
  if (el.id === 'f-mine') { ui.onlyMine = el.checked; pref.set('onlyMine', el.checked); renderResults(); }
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
    const data = { title, groupId: $('#f-group').value, ownerId: $('#f-owner').value || null, type: (f.querySelector('input[name=f-type]:checked') || {}).value, start, end, desc: $('#f-desc').value.trim(), steps };
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
  if (f.id === 'user-edit') {
    const fd = new FormData(f), body = { name: fd.get('name'), role: fd.get('role') };
    if (fd.get('password')) body.password = fd.get('password');
    if (!f.elements.active.disabled) body.active = f.elements.active.checked;
    try { await api('PUT', '/api/users/' + f.dataset.id, body); ui.editUser = null; await refresh(); render(); toast('Compte enregistré'); }
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
      const r = await api('POST', '/api/tokens', { name: $('#k-name').value.trim() || 'Claude' });
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
