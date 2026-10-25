# Sauvegardes et restauration

## Principe

| Étape | Où | Fréquence |
|---|---|---|
| 1. Sauvegarde vérifiée de la base, compressée puis **chiffrée** | Hébergement OVH (`~/projets/data/sauvegardes`) | chaque nuit (tâche CRON) |
| 2. Récupération par le serveur interne (le serveur interne *tire*, l'hébergement n'envoie rien) | Serveur interne 24/7 | chaque nuit, après l'étape 1 |
| 3. Conservation : **30 quotidiennes, 12 hebdomadaires, 12 mensuelles** | Serveur interne | automatique |
| 4. Alerte si la dernière sauvegarde a plus de 30 h ou si elle échoue | e-mail (+ webhook facultatif) | chaque nuit |
| 5. **Test de restauration** dans une base isolée | Serveur interne | chaque dimanche |

Ce qui est sauvegardé : toute la base MySQL (tâches, groupes, comptes, journal, corbeille…). Les mots de passe y sont déjà hachés. Un fichier de sauvegarde est **chiffré (AES‑256) avec une clé que seul le serveur interne peut ouvrir** : la clé privée n'est jamais sur OVH. Une sauvegarde volée sur OVH est donc illisible.

Une sauvegarde est aussi faite **automatiquement avant chaque mise à jour du code ou de la base** (déploiement, migration). Si elle échoue, rien n'est modifié.

## Mise en place (une seule fois)

### A. Créer la paire de clés de chiffrement (sur le serveur interne)
```bash
sudo mkdir -p /etc/projets-le-roy && cd /etc/projets-le-roy
sudo openssl genrsa -out sauvegarde-privee.pem 4096
sudo openssl rsa -in sauvegarde-privee.pem -pubout -out sauvegarde-publique.pem
sudo chmod 600 sauvegarde-privee.pem
```
- **Copiez `sauvegarde-privee.pem` dans un coffre** (gestionnaire de mots de passe de l'entreprise, clé USB au coffre). **Sans elle, aucune sauvegarde n'est restaurable.**
- Copiez `sauvegarde-publique.pem` sur OVH : `~/projets/config/sauvegarde-publique.pem`.

### B. Configurer l'hébergement (`~/projets/config/config.php`)
```php
'backup_public_key' => '/homez.XXX/identifiant/projets/config/sauvegarde-publique.pem',
'alert_email'       => 'informatique@le-roy.fr',
```
Le chemin complet s'obtient par SSH avec `pwd`. Test à la main : `php ~/projets/current/outils/sauvegarde.php` → la ligne doit se terminer par « chiffrée ».

### C. Programmer la sauvegarde (Manager OVH → Hébergements → *votre hébergement* → **Tâches planifiées (CRON)**)
| Commande | Fréquence |
|---|---|
| `php ~/projets/current/outils/sauvegarde.php` | 1 fois par jour, à 02 h |
| `php ~/projets/current/outils/entretien.php` | 1 fois par jour, à 03 h |
| `php ~/projets/current/outils/notifier.php` (résumé par e‑mail) | 1 fois par jour, à 07 h |

Limites OVH mutualisé à respecter : une tâche CRON ne peut pas tourner plus d'une fois par heure, dure au plus ~60 minutes, et est **désactivée après 10 échecs de suite** (vérifiez le Manager si vous recevez une alerte). La sauvegarde est écrite « en flux » (peu de mémoire) et rapide pour des bases de cette taille.
Choisissez la version de PHP de la tâche CRON ≥ 8.1 (même version que le site).

### D. Autoriser le serveur interne à lire les sauvegardes (lecture seule)
Sur le serveur interne : `ssh-keygen -t ed25519 -f /etc/projets-le-roy/id_ovh -N ""`, puis dans le Manager OVH (onglet **FTP – SSH**), ajoutez `id_ovh.pub` si votre formule le permet. Enregistrez l'empreinte du serveur une fois :
`ssh-keyscan -p 22 ssh.clusterXXX.hosting.ovh.net > /etc/projets-le-roy/known_hosts` (comparez-la avec celle du Manager).
> Si votre formule OVH n'offre pas SSH, utilisez SFTP/FTPS avec un compte FTP limité au dossier `data/sauvegardes` : adaptez `recuperer-sauvegardes.sh` (une seule commande de copie) — à valider ensemble avant la mise en production.

### E. Installer les scripts sur le serveur interne
```bash
sudo mkdir -p /opt/projets-le-roy && sudo cp -r serveur-interne/* /opt/projets-le-roy/
sudo cp serveur-interne/sauvegarde.conf.exemple /etc/projets-le-roy/sauvegarde.conf   # puis l'éditer (chmod 600)
```
Crontab du serveur interne (`sudo crontab -e`) :
```
30 3 * * *  /opt/projets-le-roy/recuperer-sauvegardes.sh   >> /var/log/projets-le-roy-sauvegardes.log 2>&1
 0 8 * * *  /opt/projets-le-roy/alerter.sh                 >> /var/log/projets-le-roy-sauvegardes.log 2>&1
 0 5 * * 0  python3 /opt/projets-le-roy/tester-restauration.py >> /var/log/projets-le-roy-sauvegardes.log 2>&1
```
`recuperer-sauvegardes.sh` vérifie l'empreinte (sha256) de chaque fichier reçu, applique la rétention 30/12/12 et n'efface jamais un fichier récent par erreur. `alerter.sh` prévient si la dernière sauvegarde est trop vieille. `tester-restauration.py` déchiffre la plus récente, la restaure dans une base **de test locale** `lr_restore_…` (supprimée ensuite) et compare le nombre de lignes de chaque table.

## Restaurer

### Test (recommandé, sans risque) — sur le serveur interne
```bash
python3 /opt/projets-le-roy/tester-restauration.py --fichier /srv/sauvegardes/projets-le-roy/quotidien/projets-AAAAMMJJ-HHMMSS.sql.gz.enc
```

### Vraie restauration (incident) — à faire à deux, calmement
1. Mettre le site en maintenance (créer le fichier `~/projets/data/etat/maintenance.flag`, ou `maintenance.php` avec la clé).
2. Récupérer le fichier voulu sur le serveur interne, le déchiffrer :
   `php outils/restaurer.php FICHIER.sql.gz.enc --cle-privee=sauvegarde-privee.pem` (par défaut vers la **base d'essai** : vérifiez d'abord que les données sont bonnes).
3. Pour remplacer la production : `php outils/restaurer.php FICHIER --cle-privee=… --cible=production --confirmer=NOM_DE_LA_BASE`. L'outil **sauvegarde d'abord l'état actuel**, puis restaure, puis compare le nombre de lignes.
4. Retirer la maintenance, se connecter, contrôler. Noter l'incident.
> En dernier recours, OVH conserve aussi ses propres sauvegardes de base (Manager → Bases de données → Restaurer une sauvegarde).

## Ce qui est vérifié automatiquement
Sauvegarde = relecture complète du fichier, nombre de lignes par table, marqueur de fin, empreinte sha256, déchiffrement d'essai. Les tests automatiques couvrent la sauvegarde, le chiffrement (compatible `openssl`/Python), la restauration isolée, la rétention et les alertes.
