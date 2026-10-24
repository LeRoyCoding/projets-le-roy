// Adresse de connexion de l'application et QR code (page Compte, et fiche imprimable /acces).
const QRCode = require('qrcode');
const { adressesReseau } = require('../outils');

module.exports = function (app, { auth, handle }) {
  const qr = url => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#232120', light: '#FFFFFF' } });

  app.get('/api/acces', auth, async (req, res) => {
    try {
      const urls = adressesReseau(req.socket.localPort);
      const principale = urls[0] || null;
      res.json({ principale, autres: urls.slice(1), qr: principale ? await qr(principale) : null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'QR code impossible à générer.' });
    }
  });

  // Fiche à imprimer et à afficher au bureau (accessible depuis le réseau local uniquement, comme toute l'application).
  app.get('/acces', async (req, res) => {
    const urls = adressesReseau(req.socket.localPort);
    const url = urls[0];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const svg = url ? await qr(url) : '';
    res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accès — Projets Le Roy</title><link rel="stylesheet" href="/fonts/polices.css">
<style>
body{margin:0;font-family:Barlow,Arial,sans-serif;color:#232120;background:#fff;display:grid;place-items:center;min-height:100vh}
main{text-align:center;padding:32px;max-width:640px}
img{height:64px}
h1{font-family:"Barlow Condensed",Arial,sans-serif;font-size:40px;margin:16px 0 4px;text-transform:uppercase;letter-spacing:.03em}
p{font-size:18px;margin:8px 0;color:#444}
.qr{width:300px;height:300px;margin:20px auto;border:2px solid #C4122F;border-radius:12px;padding:12px}
.qr svg{width:100%;height:100%}
.url{font-family:"IBM Plex Mono",Consolas,monospace;font-size:26px;font-weight:600;color:#C4122F;margin:8px 0 20px;word-break:break-all}
.aide{font-size:14px;color:#666;border-top:1px solid #ddd;padding-top:14px}
.autres{font-size:13px;color:#888}
@media print{.noprint{display:none}}
</style></head><body><main>
<img src="/img/logo-complet.png" alt="Le Roy – Lead Le Roy Concept">
<h1>Projets Le Roy</h1>
${url ? `<p>Scannez avec le téléphone ou la tablette, ou tapez l'adresse dans le navigateur :</p>
<div class="qr">${svg}</div>
<p class="url">${esc(url)}</p>
${urls.length > 1 ? `<p class="autres">Si cette adresse ne marche pas : ${urls.slice(1).map(esc).join(' · ')}</p>` : ''}
<p class="aide">Fonctionne uniquement sur le Wi-Fi du bureau. Ensuite : menu du navigateur → « Ajouter à l'écran d'accueil » ou « Créer un raccourci ».</p>
<p class="aide noprint">Pour imprimer cette fiche : <b>Ctrl + P</b>.</p>` : '<p>Ce PC n\'est connecté à aucun réseau.</p>'}
</main></body></html>`);
  });
};
