// Petits outils partagés par le serveur.
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

// Texte nettoyé avec longueur maximale (et obligatoire si demandé).
function str(v, max, label, required = false) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(400, `${label} est obligatoire.`);
  if (s.length > max) fail(400, `${label} est trop long (${max} caractères maximum).`);
  return s;
}

// Date au format AAAA-MM-JJ et réellement existante (refuse le 31 février).
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}

const newId = () => crypto.randomBytes(6).toString('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

module.exports = { HttpError, fail, str, isDate, newId, newToken, hashToken, todayIso };
