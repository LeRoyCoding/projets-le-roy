// Vérifie que le serveur répond et affiche l'adresse à donner aux collègues.
const port = Number(process.env.PORT) || 3000;

(async () => {
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    try { ok = (await fetch(`http://localhost:${port}/api/comptes`)).ok; } catch { /* pas encore prêt */ }
    if (!ok) await new Promise(r => setTimeout(r, 500));
  }
  if (!ok) {
    console.log('\n  Le serveur ne répond pas.');
    console.log('  Pour voir le problème, lancez plutôt demarrer.bat (avec la fenêtre).\n');
    process.exit(1);
  }
  const urls = require('./outils').adressesReseau(port);
  console.log('\n  ==============================================');
  console.log('   Projets Le Roy fonctionne en arrière-plan');
  console.log('  ==============================================');
  console.log(`   Sur ce PC          : http://localhost:${port}`);
  for (const url of urls) console.log(`   Pour les collègues : ${url}`);
  console.log(`   Fiche avec QR code à imprimer : http://localhost:${port}/acces`);
  console.log('\n   Aucune fenêtre à garder ouverte.');
  console.log('   Pour arrêter l\'application : arreter.bat\n');
})();
