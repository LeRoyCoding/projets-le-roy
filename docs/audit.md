# Audit et améliorations — octobre 2026

Revue complète de l'application (serveur, base de données, interface, scripts Windows), suivie des corrections
et des nouveautés demandées. Tout ce qui est listé ici est **fait et vérifié** sauf mention contraire.

## En bref

- **16 problèmes trouvés et corrigés**, dont 4 de sécurité et 6 de fiabilité. Aucun ne mettait les données en danger
  immédiat, mais plusieurs auraient gêné l'équipe au quotidien.
- **Nouveautés** : catégories personnalisables, commentaires, historique, recherche et filtres, gestion de l'équipe,
  mode sombre, export Excel, lien avec Claude.
- **Contrôle qualité** : 36 tests automatiques, relancés par GitHub à chaque modification sous Windows et Linux,
  plus un parcours complet dans un vrai navigateur (PC et téléphone).

## Problèmes trouvés

| # | Problème | Gravité | Correction |
|---|---|---|---|
| 1 | Le serveur acceptait des dates impossibles (31 février), qui faussaient la timeline | Moyenne | Dates vérifiées strictement |
| 2 | Les jetons de session étaient stockés en clair dans la base : une copie de la base permettait d'usurper une session | Moyenne | Jetons hachés (chacun se reconnecte une fois) |
| 3 | Pas d'en-têtes de sécurité (protection contre l'injection de scripts et l'affichage dans un autre site) | Faible | En-têtes CSP, nosniff, anti-iframe |
| 4 | La limite d'essais de mot de passe gardait en mémoire des identifiants inventés, sans limite | Faible | Seuls les vrais comptes sont suivis |
| 5 | Impossible de réinitialiser le mot de passe d'un collègue ou de désactiver un compte (départ) | **Importante** | Gestion de l'équipe par l'admin |
| 6 | Un double clic sur « Créer la tâche » créait deux tâches | Moyenne | Envoi bloqué pendant l'enregistrement |
| 7 | Cocher une étape attendait la réponse du serveur (lent sur tablette en Wi-Fi) | Faible | Affichage immédiat, retour en arrière en cas d'erreur |
| 8 | `mettre-a-jour.bat` échouait si l'application avait été installée avec le ZIP | **Importante** | Le dossier est relié à GitHub automatiquement à la 1re mise à jour |
| 9 | Aucune copie de sécurité avant de transformer la base lors d'une mise à jour | Moyenne | Copie `avant-mise-a-jour-…` dans `sauvegardes/` ; refus d'ouvrir une base plus récente que l'application |
| 10 | Si on cliquait « Annuler » sur l'alerte du pare-feu Windows, les collègues étaient bloqués sans solution simple | Moyenne | Script `autoriser-pare-feu.bat` |
| 11 | Une mise à jour en direct pouvait effacer un texte en cours de saisie dans la fiche | Faible | Saisie, position et focus conservés |
| 12 | Polices téléchargées chez Google à chaque ouverture (dépend d'Internet, et Google voit les connexions) | Faible | Polices copiées dans l'application |
| 13 | Données illisibles envoyées au serveur → page d'erreur technique | Faible | Message clair en français |
| 14 | Fiche tâche : le clavier (Tab) sortait de la fenêtre, le focus n'était pas rendu à la fermeture | Faible (accessibilité) | Corrigé |
| 15 | Serveur en un seul fichier, aucun test : chaque modification risquait de casser quelque chose sans qu'on le voie | Moyenne (maintenance) | Serveur découpé par thème, 36 tests automatiques |
| 16 | Interface en un seul fichier de 500 lignes | Faible (maintenance) | Découpée en 5 fichiers (`public/js/`) |

Points vérifiés **sans problème** : mots de passe hachés (bcrypt), droits d'accès (un utilisateur ne voit jamais les tâches
privées d'un autre, même en appelant le serveur directement), accès limité au réseau local, protection contre les
requêtes venues d'autres sites, échappement de tous les textes affichés (pas d'injection possible), sauvegarde quotidienne.

## Nouveautés

### Catégories (demande principale)
- Les 8 types fixes (Devis, Chantier…) deviennent des **catégories modifiables**, dans un nouvel onglet **Catégories**.
- Créer une catégorie (nom + pictogramme parmi 40, ou n'importe quel emoji), y compris **directement depuis le formulaire de tâche**.
- Renommer, changer le pictogramme, changer l'ordre, **masquer** (n'est plus proposée, les anciennes tâches la gardent), supprimer.
- L'administrateur peut supprimer une catégorie utilisée en **déplaçant ses tâches** dans une autre.
- **Filtre par catégorie** sur l'accueil et la timeline.

### Tâches
- **Recherche** dans les titres, descriptions, étapes, noms (touche « / » pour y aller directement).
- **Seulement mes tâches**, **Masquer les terminées** (mémorisés sur chaque poste).
- **Compteurs cliquables** : un clic sur « 🚨 en retard » n'affiche que les tâches en retard.
- **Commentaires** sur chaque tâche, avec compteur 💬 sur l'accueil.
- **Historique** : qui a créé, coché, modifié quoi, et quand.
- **Tâche sans étapes** : bouton « Terminée ».
- **Dupliquer** une tâche ; **réordonner les étapes** avec des flèches.
- La timeline s'ouvre centrée sur aujourd'hui.

### Équipe (administrateur)
- Renommer, changer le rôle, **donner un nouveau mot de passe**, **désactiver** un compte (ses tâches restent).
- Garde-fou : il reste toujours au moins un administrateur actif.

### Confort et exploitation
- **Mode sombre** (ou automatique selon l'ordinateur).
- **Export Excel** (CSV) des tâches affichées.
- **Sauvegarde complète téléchargeable** par l'administrateur.
- **Impression** propre (sans menus ni boutons).
- Version de l'application affichée dans la page Compte.

### Lien avec Claude
- Chaque personne peut créer une **clé d'accès** personnelle (page Compte), révocable à tout moment.
- **Connecteur** `outils/claude-mcp.js` : Claude Desktop peut résumer la situation, lister, créer, modifier des tâches,
  cocher des étapes, commenter. Il agit avec les droits de la personne et **ne peut rien supprimer**.
- `lier-a-claude.bat` configure Claude Desktop en une minute. Détails : [lier-a-claude.md](lier-a-claude.md).

## Hypothèses prises (à valider)

1. **« Catégories » = les types de tâche** (Devis, Chantier…), rendus personnalisables. Si vous pensiez à autre chose
   (par exemple regrouper les groupes en familles), dites-le : la base est prête à évoluer.
2. **Tout le monde peut créer, renommer et masquer une catégorie** ; supprimer une catégorie utilisée est réservé à l'admin.
3. Les **commentaires** sont visibles par toutes les personnes qui voient la tâche ; chacun peut supprimer les siens, l'admin tous.
4. On **désactive** un compte plutôt que de le supprimer, pour garder l'historique.
5. Claude ne peut **pas supprimer** de tâche (sécurité).
6. Les **notifications d'échéance** et le **lien avec Business Central** restent pour plus tard, comme prévu dans CLAUDE.md.

## Recommandations pour la suite

| Priorité | Recommandation |
|---|---|
| Haute | Donner une **adresse IP fixe** au PC serveur (réglage de la box ou du routeur), pour que l'adresse des collègues ne change jamais. |
| Haute | Copier régulièrement le dossier `sauvegardes\` **hors du PC** (clé USB, NAS). Une copie automatique vers un dossier réseau peut être ajoutée. |
| Moyenne | **Notifications d'échéance** (e-mail ou Teams le matin : tâches en retard et à J-2). |
| Moyenne | **Pièces jointes** sur les tâches (photos de chantier, PDF de devis). |
| Moyenne | Lien avec **Business Central** (clients, devis). |
| Basse | Échéance et responsable **par étape**. |
| Basse | HTTPS sur le réseau local, pour une installation « application » complète dans tous les navigateurs (aujourd'hui : raccourci « Ouvrir dans une fenêtre », qui fonctionne bien). |

## Comment c'est vérifié

- `npm test` : 36 tests automatiques (droits d'accès, validations, catégories, équipe, commentaires, historique,
  clés d'accès, sauvegarde, mise à jour d'une ancienne base, connecteur Claude).
- GitHub relance ces tests à chaque modification, sous **Windows** et Linux, avec Node.js 22 et 24.
- Parcours complet dans un vrai navigateur : 18 scénarios (recherche, filtres, catégories, création, commentaires en direct
  entre deux postes, équipe, export, sauvegarde, mode sombre, téléphone), sans erreur.
