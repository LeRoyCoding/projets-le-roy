# Sécurité et compatibilité OVHcloud Web PRO

## Compatibilité à vérifier dans votre Manager OVH
Les points ci-dessous viennent de la documentation publique d'OVH et du code ; **seul un essai sur votre hébergement peut les confirmer** (case « à vérifier » = non testé en réel).

| Sujet | Exigence / limite | Statut |
|---|---|---|
| PHP | 8.1 minimum (8.1, 8.2, 8.3 testés). Version choisie dans le Manager ou `.ovhconfig` | à vérifier sur votre offre |
| Extensions | `pdo_mysql`, `mbstring`, `json`, `openssl`, `zlib`, `ctype` (contrôlées par `installer.php`) | à vérifier |
| Base | MySQL 8 / MariaDB 10.x testés ; utf8mb4 ; la migration ne requiert aucun droit exceptionnel | testé localement (MariaDB 10.11) ; MySQL 8 par la CI GitHub |
| Mémoire/temps PHP | sauvegarde en flux (≈ 24 Mo de mémoire quelle que soit la taille) ; scripts web courts | testé avec limite de 24 Mo |
| Tâches planifiées (CRON) | ≥ 1 h entre deux exécutions, ~60 min max, sortie limitée, désactivation après 10 échecs consécutifs | respecté ; à vérifier dans le Manager |
| `php.ini` | non modifiable sur mutualisé : l'application n'en a pas besoin | OK |
| SSH | dépend de la formule ; les connexions *sortantes* depuis OVH sont limitées → c'est donc le serveur interne qui tire les sauvegardes | à vérifier |
| Liens symboliques (`current`) | utilisés pour le déploiement atomique ; plan B sans lien : changer le dossier racine dans *Multisite* | à vérifier |
| `mail()` | utilisé pour les alertes et le résumé quotidien ; peut être filtré (SPF/DKIM) | à vérifier (prévoir un test d'envoi) |
| Droits de fichiers | dossiers 750, fichiers 640 ; `config.php` 600/640 ; `data/` jamais dans `www/` | contrôlés par `installer.php` |
| HTTPS | obligatoire (certificat OVH/Let's Encrypt) ; redirection dans `.htaccess` ; cookie `__Host-` | à activer au Manager |

## Mesures de sécurité en place
- **Installation / maintenance** : `installer.php` et `maintenance.php` exigent la clé de maintenance (envoyée en POST, jamais dans l'adresse), comparée en temps constant, avec limitation des essais. Après installation, `installer.php` ne peut plus rien créer.
- **Administrateur initial** : choisi par la personne qui installe (12 caractères min.), aucun mot de passe par défaut. Récupération : `maintenance.php` (clé) ou `outils/admin.php` (SSH) → mot de passe provisoire aléatoire.
- **Mots de passe** : bcrypt (coût 11), 12 caractères minimum, refus des mots de passe triviaux ou contenant le nom ; changement obligatoire pour les mots de passe provisoires.
- **Sessions** : jeton aléatoire stocké **haché** en base ; cookie `__Host-` `Secure`, `HttpOnly`, `SameSite=Strict` ; inactivité 14 jours, durée maximale 30 jours ; déconnexion de tous les appareils possible.
- **Force brute** : ralentissement progressif par compte **et** par adresse IP ; messages identiques que le compte existe ou non ; liste des comptes masquée sur l'écran de connexion (réglage de l'administrateur).
- **CSRF** : contrôle de `Origin`/`Sec-Fetch-Site` et `Content-Type: application/json` obligatoire pour toute écriture.
- **Droits côté serveur** : voir `docs/guide-utilisateur.md` ; toute requête est vérifiée même si le bouton est caché. Un utilisateur sans droit reçoit 404 (il ne peut pas deviner l'existence d'une tâche).
- **Clés d'accès (Claude/ChatGPT)** : en-tête uniquement ; empreinte stockée (la clé n'est affichée qu'une fois) ; expiration ; portée lecture seule ou lecture/écriture ; aucune suppression ni action d'administration possible avec une clé.
- **Corbeille** : suppression réversible (90 jours) ; purge définitive réservée à l'administrateur.
- **Journal** (`audit_log`) : connexions, échecs, droits, suppressions/restaurations, sauvegardes, migrations ; aucune route ne le modifie ni ne l'efface.
- **Fichiers sensibles** : `config.php`, sauvegardes, état et fichiers hors du dossier public ; `.htaccess` bloque en plus `.sql .env .pem .key .json .md .log…` et les fichiers PHP internes ; `robots.txt` + `X-Robots-Tag` interdisent l'indexation.
- **En-têtes** : HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP stricte (scripts du site uniquement).
- **Sauvegardes** : chiffrées avec une clé publique ; la clé privée reste hors OVH (voir `sauvegardes.md`). Restauration jamais vers la production sans confirmation explicite du nom de la base.

## Risques restants (à connaître)
1. Sur hébergement mutualisé, d'autres sites partagent la machine : la protection repose sur l'isolation OVH (open_basedir/droits). Les secrets sont donc hors du site et en droits restreints, mais ce n'est pas l'équivalent d'un serveur dédié.
2. La clé privée de sauvegarde est la clé de voûte : à conserver dans un coffre, sinon plus de restauration possible.
3. Aucune double authentification (2FA) pour l'instant — à envisager si l'application contient des données sensibles. Mots de passe longs recommandés.
4. `mail()` peut finir en courrier indésirable : les alertes de sauvegarde ne doivent pas être la **seule** surveillance (le serveur interne alerte aussi sur l'absence de sauvegarde).
