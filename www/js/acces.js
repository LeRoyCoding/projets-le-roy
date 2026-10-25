// Fiche imprimable : adresse du site et QR code.
(function () {
  var url = location.origin;
  var q = qrcode(0, 'M'); q.addData(url); q.make();
  document.getElementById('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  document.getElementById('url').textContent = url;
})();
