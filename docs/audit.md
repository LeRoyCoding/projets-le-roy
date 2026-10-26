# Audit de sécurité et de fiabilité — Projets Le Roy

Audit réalisé à partir du dépôt GitHub (version PHP/MySQL précédente, PR « OVH » fusionnée dans `main`) et de l'archive transmise. Les corrections de l'archive ChatGPT ont été **vérifiées** avant reprise : elles étaient un petit correctif partiel (clé de maintenance passée dans l'adresse, accès de test dans le code) ; leur principe a été **remplacé** par une version plus sûre. Chaque point a un test automatique.

| # | Problème constaté | Gravité | Correction | Où c'est testé |
|---|---|---|---|---|
| 1 | `installer.php` accessible à tous, pouvait recréer/modifier | Critique | Clé de maintenance (POST), inopérant une fois installé, contrôle hors-site de `config.php` et `data/` | `installateur.test.js` |
| 2 | Mot de passe administrateur initial faible/connu (et procédure de réinitialisation avec hash connu dans le README) | Critique | L'installateur demande un mot de passe fort ; récupération par mot de passe provisoire aléatoire ; hash connu supprimé de la doc | `installateur`, `securite` |
| 3 | Migrations lancées par de simples requêtes | Élevée | Migrations **volontaires** uniquement, sauvegarde vérifiée avant, verrou, code 503 `schema` sinon | `maintenance.test.js` |
| 4 | Clés d'accès dans l'adresse (journaux, historique) | Élevée | En-tête uniquement, portée, expiration, empreinte | `connecteur-mcp`, `claude` |
| 5 | Suppression définitive sans corbeille | Élevée | Corbeille 90 jours, restauration, purge réservée à l'admin | `corbeille.test.js` |
| 6 | Droits de modification/suppression trop larges | Élevée | Rôles par groupe (responsable/membre/lecteur), règles propriétaire/créateur appliquées par le serveur | `droits.test.js` |
| 7 | Sauvegarde/restauration faibles | Élevée | Sauvegarde vérifiée, chiffrée, manifeste sha256, restauration isolée, serveur interne | `sauvegarde`, `serveur-interne` |
| 8 | Export SQL construit en mémoire PHP | Moyenne | Export en flux (24 Mo de mémoire suffisent) | `sauvegarde.test.js` |
| 9 | Tests non validés sur MySQL | Moyenne | Tests contre MariaDB 10.11 en local ; matrice GitHub MySQL 8.0 / MariaDB 10.11 × PHP 8.1/8.2/8.3 | `.github/workflows/tests.yml` |

Autres constats corrigés : configuration dans le dossier public (déplacée hors site), sessions en clair (jetons hachés), absence de limite d'essais par compte (progressif), pas de contrôle CSRF, journal modifiable (écriture seule), `config.exemple.php` incomplet.

Points **non résolus ou à vérifier en réel** : voir `securite-et-compatibilite-ovh.md` et `rapport-de-tests.md`.
