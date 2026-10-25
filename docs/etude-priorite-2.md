# Étude — fonctions de priorité 2 (à étudier avant de développer)

État : **tableau de bord Direction** déjà réalisé (lecture seule, agrégats, `/api/direction`). Le reste est étudié ci-dessous ; rien n'est développé tant que vous n'avez pas validé. Principe : fiabilité d'abord, interface simple.

## 1. Pièces jointes
- **Stockage** : fichiers dans `~/projets/data/pieces/` (hors site public), jamais servis directement ; téléchargement par `/api/pieces/{id}` après contrôle des droits (lecture du groupe). Table `attachments` (tâche, nom d'origine, nom disque aléatoire, taille, type, sha256, auteur, `deleted_at` pour la corbeille).
- **Sécurité** : liste blanche d'extensions (pdf, images, office, csv, txt), vérification du type réel (`finfo`), 10 Mo par fichier (limite PHP OVH à vérifier), nom disque aléatoire, `Content-Disposition: attachment` + `nosniff`, aucun fichier exécutable. Antivirus : non disponible sur mutualisé → risque à accepter ou analyse côté serveur interne.
- **Sauvegarde** : à ajouter au circuit (rsync du dossier `pieces/`, rétention identique). **À décider avant** : volume attendu (devis PDF, photos de chantier ?). 250 Go disponibles : suffisant.
- **Effort** : moyen (≈ 2–3 jours). **Risque** : moyen (fichiers = surface d'attaque).

## 2. Tâches récurrentes
- Modèle : table `recurrences` (tâche modèle, règle : quotidien/hebdo/mensuel/annuel, jour, fin). Génération par le CRON quotidien (`entretien.php`) ; idempotente (clé « modèle + date ») pour ne jamais créer deux fois la même occurrence, même si le CRON est relancé.
- Chaque occurrence est une vraie tâche (étapes recopiées, non cochées). Désactivation = pas de suppression des occurrences passées.
- **Piège** : jours inexistants (31 février), fuseau Europe/Paris, rattrapage après panne (créer seulement les occurrences utiles, pas 30 d'un coup).
- **Effort** : moyen. **Risque** : faible si l'idempotence est testée.

## 3. Responsable et échéance par étape
- Colonnes additives `steps.owner_id`, `steps.due_date` (migration simple, aucune perte). Droits : le responsable d'une étape peut la cocher même en lecture seule (comme pour une tâche attribuée).
- Retards calculés au niveau étape ; notifications « étape attribuée ». Interface : deux petits champs optionnels dans l'étape, rien de plus.
- **Effort** : faible à moyen. **Risque** : faible. **Recommandé en premier.**

## 4. Recherche et filtres
- Recherche texte (titre, description, étapes, commentaires) limitée aux tâches visibles par la personne. MySQL : `LIKE` suffit pour quelques milliers de tâches ; `FULLTEXT` ensuite si besoin.
- Filtres : groupe, responsable, type, priorité, statut (en retard / bientôt / terminée), période. Côté navigateur pour les listes déjà chargées ; côté serveur pour l'historique et la corbeille.
- **Effort** : faible. **Risque** : faible (les droits sont déjà appliqués par le serveur).

## 5. Tableau de bord Direction (fait)
Vue en lecture seule : retards par groupe et par personne, charge, tâches urgentes, activité récente. Aucun nom de tâche d'un groupe où l'on n'a pas de droit : seul l'administrateur y accède.

## Ordre proposé
1. Étapes avec responsable/échéance → 2. Recherche et filtres → 3. Tâches récurrentes → 4. Pièces jointes (après décision sur le volume et la sauvegarde).
