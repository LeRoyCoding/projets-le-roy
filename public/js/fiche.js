// Fiche tâche (fenêtre par-dessus) : avancement, étapes, commentaires, historique.
'use strict';

const ACTIONS = {
  creation: () => 'a créé la tâche',
  modification: d => d ? 'a modifié : ' + d : 'a modifié la tâche',
  etape_cochee: d => `a coché « ${d} »`,
  etape_decochee: d => `a décoché « ${d} »`,
  etape_ajoutee: d => `a ajouté l'étape « ${d} »`,
  etape_supprimee: d => `a supprimé l'étape « ${d} »`,
  terminee: () => 'a marqué la tâche terminée',
  rouverte: () => 'a rouvert la tâche'
};

let lastFocus = null;
function renderModal() {
  const m = $('#modal'), t = S && S.tasks.find(x => x.id === ui.openTask), me = cur();
  if (!t || !me) {
    if (!m.hidden) { m.hidden = true; m.innerHTML = ''; document.documentElement.style.overflow = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
    return;
  }
  const wasOpen = !m.hidden;
  if (!wasOpen) lastFocus = document.activeElement;
  // Garde la saisie en cours (commentaire, nouvelle étape) quand la fiche se met à jour.
  const keep = {};
  for (const id of ['ns-label', 'ns-desc', 'c-body']) { const el = document.getElementById(id); if (el) keep[id] = el.value; }
  const focused = document.activeElement && m.contains(document.activeElement) ? document.activeElement.id : null;
  const scroll = m.querySelector('.sheet')?.scrollTop || 0;

  const g = groupById(t.groupId), cat = catById(t.type), p = pct(t), done = t.steps.filter(s => s.done).length, can = canEdit(t), st = status(t);
  const det = ui.details && ui.details.taskId === t.id ? ui.details : null;
  m.hidden = false; document.documentElement.style.overflow = 'hidden';
  m.innerHTML = `<div class="scrim" data-act="close-modal"></div><div class="sheet ${wasOpen ? '' : 'anim'}" role="dialog" aria-modal="true" aria-labelledby="mt" style="--g:${esc(g.color)}">
 <div class="sheet-h"><div class="crumbs"><span class="tag g">${gIcon(g.icon, '')}${groupName(g)}</span><span class="tag">${emo(cat.emoji)}${esc(cat.label)}</span>${isShared(g) ? '<span class="tag">' + emo('👥') + 'Groupe commun</span>' : ''}</div><button class="icon-btn" data-act="close-modal" aria-label="Fermer" id="m-close">${ic('close')}</button></div>
 <h2 id="mt">${esc(t.title)}</h2>
 <dl class="facts"><div><dt>Pour qui</dt><dd>${t.ownerId ? esc(userById(t.ownerId).name) : 'Tout le groupe'}</dd></div><div><dt>Début</dt><dd class="mono">${fmtLong(t.start)}</dd></div><div><dt>Fin</dt><dd><span class="mono">${fmtLong(t.end)}</span>${badge(t)}</dd></div>
 <div><dt>Priorité</dt><dd><span class="prio p${t.priority || 3}">${emo(prio(t).e)}${prio(t).label}</span></dd></div>
 <div><dt>Créée par</dt><dd>${t.createdBy ? esc(userById(t.createdBy).name) : '—'}${t.createdAt ? `<span class="mono small">${fmtStamp(t.createdAt)}</span>` : ''}</dd></div></dl>
 ${t.doneAt ? `<p class="valide">${emo('✅')} Terminée par <b>${t.doneBy ? esc(userById(t.doneBy).name) : '—'}</b> · ${fmtStamp(t.doneAt)} — disparaîtra de l'écran ${esc(disparitionLe(t))}</p>` : ''}
 ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ''}
 <div class="prog"><div class="prog-n">${p}<small>%</small></div><div class="prog-b"><span class="bar big"><span style="width:${p}%;background:${st === 'done' ? 'var(--ok)' : 'var(--g)'}"></span></span>
  <p>${t.steps.length ? `${done} étape${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''} sur ${t.steps.length}` : 'Aucune étape : avancement à 0 % ou 100 %'}</p></div>
  ${!t.steps.length && can ? `<button class="btn sm ${t.completed ? '' : 'primary'}" data-act="toggle-completed">${t.completed ? 'Rouvrir' : ic('check', 'sm') + 'Terminée'}</button>` : ''}</div>
 <h3>Étapes</h3>
 <ol class="steps">${t.steps.map(s => `<li class="step ${s.done ? 'done' : ''}"><button class="check" data-act="toggle-step" data-s="${esc(s.id)}" aria-pressed="${s.done}" aria-label="${s.done ? 'Décocher' : 'Cocher'} : ${esc(s.label)}" ${can ? '' : 'disabled'}>${ic('check')}</button><div><p class="sl">${esc(s.label)}</p>${s.desc ? `<p class="sd">${esc(s.desc)}</p>` : ''}${s.done && (s.doneBy || s.doneAt) ? `<p class="qui">${ic('check', 'sm')}Validée par <b>${s.doneBy ? esc(userById(s.doneBy).name) : '—'}</b>${s.doneAt ? ' · ' + fmtStamp(s.doneAt) : ''}</p>` : ''}</div>${can ? `<button class="del" data-act="del-step" data-s="${esc(s.id)}" aria-label="Supprimer l'étape">${ic('trash')}</button>` : '<span></span>'}</li>`).join('') || '<li class="step"><span></span><p class="sd">Aucune étape pour l\'instant.</p><span></span></li>'}</ol>
 ${can ? `<form id="step-form" class="addstep"><input type="text" id="ns-label" maxlength="300" placeholder="Nouvelle étape" required aria-label="Nouvelle étape"><input type="text" id="ns-desc" maxlength="2000" placeholder="Description (facultatif)" aria-label="Description"><button class="btn primary sm">${ic('plus', 'sm')}Ajouter</button></form>` : ''}
 <h3>Commentaires${det && det.comments.length ? ` <small class="count">${det.comments.length}</small>` : ''}</h3>
 <ul class="comments">${det ? det.comments.map(c => {
    const u = userById(c.userId), mineOrAdmin = c.userId === me.id || isAdmin();
    return `<li><span class="av">${ini(u)}</span><div><p class="c-h"><b>${esc(u.name)}</b><span>${fmtStamp(c.at)}</span></p><p class="c-b">${esc(c.body)}</p></div>${mineOrAdmin ? `<button class="del" data-act="del-comment" data-id="${esc(c.id)}" aria-label="Supprimer le commentaire">${ic('trash')}</button>` : '<span></span>'}</li>`;
  }).join('') || '<li class="hint none">Aucun commentaire. Notez ici les échanges, relances, informations utiles…</li>' : '<li class="hint none">Chargement…</li>'}</ul>
 <form id="comment-form" class="addcomment"><textarea id="c-body" maxlength="3000" rows="2" placeholder="Écrire un commentaire…" aria-label="Nouveau commentaire"></textarea><button class="btn sm">${ic('send', 'sm')}Envoyer</button></form>
 ${det && det.activity.length ? `<details class="history" ${ui.historyOpen ? 'open' : ''}><summary>Historique (${det.activity.length})</summary><ul>${det.activity.map(a => `<li><span class="h-when">${fmtStamp(a.at)}</span><span><b>${esc(userById(a.userId).name)}</b> ${esc((ACTIONS[a.action] || (() => a.action))(a.detail))}</span></li>`).join('')}</ul></details>` : ''}
 ${can ? `<div class="sheet-f"><button class="btn" data-act="dup-task">${ic('copy', 'sm')}Dupliquer</button><button class="btn" data-act="edit-task">Modifier la tâche</button><button class="btn danger ${ui.confirmDel ? 'armed' : ''}" data-act="del-task">${ui.confirmDel ? 'Confirmer la suppression' : 'Supprimer'}</button></div>` : ''}
 </div>`;
  for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el) el.value = v; }
  const sheet = m.querySelector('.sheet');
  if (wasOpen) sheet.scrollTop = scroll;
  if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
  else if (!wasOpen) $('#m-close').focus();
}

// Garde le clavier (Tab) à l'intérieur de la fiche ouverte.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || $('#modal').hidden) return;
  const f = [...$('#modal').querySelectorAll('button:not([disabled]), input, textarea, select, summary, [href]')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
