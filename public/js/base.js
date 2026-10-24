// Outils de base : dates, échappement HTML, icônes, échanges avec le serveur, petites notifications.
'use strict';

const IMG = { full: '/img/logo-complet.png', lr: '/img/logo-le-roy.png', llc: '/img/logo-llc.png' };
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  copy: '<path d="M8 8h11v11H8zM5 16V5h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff: '<path d="M4 4l16 16M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.3 7.6A16.4 16.4 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'
};
const GROUP_ICONS = ['img:lr', 'img:llc', '🏢', '🐔', '🥚', '🚜', '📦', '🛠️', '💡', '📊', '👥', '🏡', '🎯', '🌍'];
const GROUP_COLORS = ['#C4122F', '#666A6F', '#2E8C76', '#D08A1E', '#3F7CC0', '#7A5AB5'];
// Pictogrammes proposés pour les catégories (on peut aussi en taper un autre).
const CAT_EMOJIS = ['🧾', '🏗️', '🤝', '💻', '📋', '⚙️', '🎪', '🏡', '🔧', '🛠️', '🚚', '📦', '🐔', '🥚', '🐣', '🌾', '🚜', '🏭',
  '💶', '📞', '✉️', '📝', '📐', '📊', '🎓', '🧪', '🔌', '💡', '🌡️', '💧', '🔥', '🌬️', '🧹', '🛡️', '⚖️', '📣', '📸', '🗂️', '🎯', '⭐'];

// Niveaux de priorité d'une tâche (3 = normale, par défaut).
const PRIORITES = {
  1: { label: 'Urgente', e: '🔴', court: 'Urgent' },
  2: { label: 'Haute', e: '🟠', court: 'Haute' },
  3: { label: 'Normale', e: '🔵', court: 'Normale' },
  4: { label: 'Basse', e: '⚪', court: 'Basse' }
};
const prio = t => PRIORITES[t.priority] || PRIORITES[3];

const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const iso = d => { const z = new Date(d); return z.getFullYear() + '-' + String(z.getMonth() + 1).padStart(2, '0') + '-' + String(z.getDate()).padStart(2, '0'); };
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addD = (n, base) => iso((base ? pd(base) : today()).getTime() + n * DAY);
const diffD = (a, b) => Math.round((pd(b) - pd(a)) / DAY);
const fmt = s => pd(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtLong = s => pd(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
// Horodatage du serveur (UTC, « AAAA-MM-JJ HH:MM:SS ») → « 22 oct. 14:05 » ou « aujourd'hui 14:05 »
function fmtStamp(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = iso(d);
  if (day === iso(today())) return 'aujourd\'hui ' + time;
  if (day === addD(-1)) return 'hier ' + time;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const emo = e => `<i class="emo" aria-hidden="true">${esc(e)}</i>`;
const gIcon = (icon, alt) => icon && icon.startsWith('img:') ? `<img src="${IMG[icon.slice(4)] || IMG.lr}" alt="${esc(alt || '')}">` : emo(icon || '📁');
const $ = s => document.querySelector(s);
const plural = (n, word, words) => `${n} ${n > 1 ? (words || word + 's') : word}`;
// Texte sans accents ni majuscules, pour la recherche.
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Petite mémoire du navigateur (préférences de chacun) ---------- */
const pref = {
  get(k, d) { try { const v = localStorage.getItem('lr-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lr-' + k, JSON.stringify(v)); } catch { /* navigation privée */ } }
};

/* ---------- Échanges avec le serveur ---------- */
let onUnauthorized = () => {};
async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') opt.headers['Content-Type'] = 'application/json';
  if (body !== undefined) opt.body = JSON.stringify(body);
  let res;
  try { res = await fetch(url, opt); }
  catch { throw new Error('Le serveur ne répond pas. Vérifiez que le PC serveur est allumé.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { await onUnauthorized(); throw new Error(data.error || 'Session expirée.'); }
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3000);
}

// Fait télécharger un fichier généré dans le navigateur.
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/* ---------- Thème clair / sombre ---------- */
function applyTheme() {
  const t = pref.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();
