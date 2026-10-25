<?php
// Données d'exemple (celles de la maquette) pour essayer l'application ou faire des captures d'écran.
//   LR_DB_NAME=... LR_DB_USER=... LR_DB_PASS=... php outils/donnees-demo.php
// Refuse de s'exécuter si la base contient déjà des tâches (jamais sur de vraies données).
// Comptes créés : Antoine, Claire, Julien (mot de passe « demo0000 »). Le compte Administrateur doit exister (outils/test-base.php admin).
declare(strict_types=1);
require dirname(__DIR__) . '/www/api/lib.php';
migrer();
if ((int)val('SELECT COUNT(*) FROM tasks') > 0) { fwrite(STDERR, "La base contient déjà des tâches : rien n'a été fait.\n"); exit(1); }
$day = fn(int $n) => date('Y-m-d', strtotime(($n >= 0 ? "+$n" : (string)$n) . ' days'));
$ago = fn(int $n) => gmdate('Y-m-d H:i:s', time() - $n * 86400);
tx(function () use ($day, $ago) {
    $U = [];
    foreach (['Antoine', 'Claire', 'Julien'] as $i => $name) {
        $U[$name] = newId();
        q('INSERT INTO users (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [$U[$name], $name, password_hash('demo0000', PASSWORD_BCRYPT), 'user', gmdate('Y-m-d H:i:s', time() + $i)]);
    }
    $G = [];
    $groups = [['lr', 'Le Roy', 'img:lr', '#C4122F', ['Antoine', 'Claire', 'Julien']], ['llc', 'LLC', 'img:llc', '#666A6F', ['Antoine', 'Claire']],
        ['p1', 'Perso', '🏡', '#2E8C76', ['Antoine']], ['p2', 'Perso', '🏡', '#3F7CC0', ['Claire']], ['p3', 'Perso', '🏡', '#D08A1E', ['Julien']]];
    foreach ($groups as $i => [$k, $name, $icon, $color, $members]) {
        $G[$k] = newId();
        q('INSERT INTO groupes (id, name, icon, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$G[$k], $name, $icon, $color, $i + 1, now()]);
        foreach ($members as $m) q('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [$G[$k], $U[$m]]);
    }
    // [groupe, responsable, catégorie, titre, début, fin, description, étapes, étapes faites, terminée il y a n jours, priorité]
    $T = [
        ['lr', 'Antoine', 'devis', 'Devis chaîne plate – élevage 30 000 poulets', -6, 4, 'Bâtiment 120 × 15 m, 2 lignes. Le client attend une variante avec trémie double.', [['Relevé des cotes du bâtiment', 'Plan transmis par le client'], ['Configurer la chaîne plate', 'Longueur, nombre de coins, moteurs'], ['Chiffrer la variante trémie double'], ['Export CSV vers Business Central', 'Vérifier les références articles'], ['Envoyer le devis et relancer à J+5']], 3, 0, 1],
        ['lr', null, 'event', 'Préparer le stand du salon', -4, 9, "Tâche commune à toute l'équipe Le Roy.", [['Liste du matériel à exposer'], ['Réserver le transport'], ['Imprimer les fiches produits'], ['Planning de présence sur le stand']], 1, 0, 2],
        ['lr', 'Antoine', 'dev', 'Outil atelier radiants', -3, 20, 'Outil tablette pour le suivi de production des radiants.', [['Prototype ergonomie'], ["Test avec l'opérateur", 'Poser la tablette sans explication'], ['Liste des composants et sous-composants'], ['Photos des notices'], ['Choix MobileNAV ou Power Apps', 'Avec le prestataire BC'], ['Déploiement en atelier']], 2, 0, 3],
        ['lr', 'Julien', 'chantier', 'Ventilation bâtiment reproducteurs', -15, 6, "Remplacement de 6 extracteurs et du boîtier de régulation.", [['Commande du matériel'], ["Planification de l'équipe de pose"], ['Dépose des anciens extracteurs'], ['Pose et câblage'], ['Mise en service et réglage', "Avec l'éleveur"]], 4, 0, 3],
        ['lr', 'Claire', 'admin', 'Tarifs 2027 dans Business Central', 2, 30, 'Intégrer les nouvelles grilles fournisseurs.', [['Recevoir les grilles fournisseurs'], ['Calcul des coefficients'], ['Import des prix'], ['Contrôle sur 10 devis types']], 0, 0, 3],
        ['lr', 'Claire', 'commercial', 'Relance clients pondoirs Q4', -20, -2, 'Clients ayant reçu une offre pondoirs depuis juin.', [['Extraire la liste des offres ouvertes'], ['Appeler les prioritaires'], ['Mettre à jour les probabilités']], 2, 0, 2],
        ['llc', null, 'commercial', 'Plaquette Lead Le Roy Concept', -5, 15, '4 pages : concept, références, contact. Tâche commune LLC.', [['Textes'], ['Photos de réalisations'], ['Mise en page'], ['Validation et impression']], 2, 0, 3],
        ['llc', 'Antoine', 'dev', 'Agent devis CSV – chaîne plate', -8, 25, "Générer le CSV d'import BC depuis le configurateur.", [['Format CSV Business Central', 'Colonnes et références'], ['Règles de la chaîne plate'], ['Tests sur 3 devis réels'], ['Étendre aux autres configurateurs'], ['Documentation']], 1, 0, 3],
        ['p1', 'Antoine', 'perso', 'Révision voiture', 1, 5, '', [['Prendre rendez-vous'], ['Déposer le véhicule']], 0, 0, 4],
        ['p2', 'Claire', 'perso', 'Inscription formation anglais', -4, 18, '', [['Comparer les organismes'], ['Demande de prise en charge'], ['Inscription']], 1, 0, 3],
        // Tâches terminées : l'une encore affichée (il y a 2 jours), l'autre archivée (il y a 12 jours)
        ['lr', 'Julien', 'chantier', 'Pose pondoirs – élevage Morel', -30, -3, 'Installation de 2 lignes de pondoirs automatiques.', [['Livraison du matériel'], ['Pose des lignes'], ['Réception avec l\'éleveur']], 3, 2, 3],
        ['lr', 'Claire', 'devis', 'Devis abreuvoirs – GAEC du Moulin', -40, -12, 'Variante pipettes inox.', [['Relevé des besoins'], ['Chiffrage'], ['Envoi du devis']], 3, 12, 3],
    ];
    foreach ($T as [$g, $owner, $type, $title, $s, $e, $desc, $steps, $done, $finiIlYa, $prio]) {
        $id = newId();
        $by = $owner ? $U[$owner] : $U['Antoine'];
        q('INSERT INTO tasks (id, group_id, owner_id, type, title, description, start_date, end_date, created_by, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [$id, $G[$g], $owner ? $U[$owner] : null, $type, $title, $desc, $day($s), $day($e), $by, $prio, $ago(abs($s)), now()]);
        foreach ($steps as $i => $st) {
            $faite = $i < $done;
            q('INSERT INTO steps (id, task_id, position, label, description, done, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [newId(), $id, $i, $st[0], $st[1] ?? '', $faite ? 1 : 0, $faite ? $by : null, $faite ? $ago($finiIlYa + count($steps) - $i) : null]);
        }
        if ($finiIlYa) q('UPDATE tasks SET done_at = ?, done_by = ? WHERE id = ?', [$ago($finiIlYa), $by, $id]);
    }
});
echo "Données d'exemple créées (comptes Antoine, Claire, Julien : mot de passe demo0000).\n";
