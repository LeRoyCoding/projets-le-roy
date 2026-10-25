# Feuille de route — ce qui manque pour un outil « parfait »

Comparaison avec les outils de gestion de projets du marché (Asana, Monday, ClickUp, Microsoft Planner / Project,
Notion, Trello, Jira), en tenant compte du contexte Le Roy : petite équipe, utilisateurs non
informaticiens, devis et chantiers avicoles, Business Central.

## Ce que Projets Le Roy fait déjà bien

Tâches avec étapes et avancement, groupes communs ou privés, catégories, timeline type Gantt, temps réel entre les
postes, commentaires, qui a validé chaque étape et quand, historique des tâches terminées (admin), recherche et filtres,
export Excel, sauvegardes automatiques, mode sombre, tablette, lien avec Claude et ChatGPT. Hébergée chez OVHcloud depuis octobre 2026 (accessible partout, avec QR code d'accès). Et surtout : simple,
en français et sans abonnement logiciel.

## Ce qui manque, par priorité

### 🔴 Priorité haute — gros gain au quotidien, effort raisonnable

| Manque | Ce que font les grands outils | Proposition pour Le Roy |
|---|---|---|
| **Rappels et notifications** | E-mail / notification quand une tâche m'est attribuée, quand l'échéance approche, quand on me mentionne | Résumé quotidien par e-mail (ou Teams) à 8 h : mes tâches en retard et à J-2 ; notification quand on m'attribue une tâche. *Prévu « plus tard » dans le cahier des charges.* |
| **Pièces jointes** | Photos, PDF, plans attachés aux tâches | Joindre des photos de chantier, PDF de devis, plans à une tâche ou un commentaire (stockés sur le PC serveur, inclus dans les sauvegardes). |
| **Modèles de tâches** | Gabarits réutilisables | « Modèle Devis chaîne plate » avec ses étapes types ; création en un clic. (La duplication existe déjà, les modèles iraient plus loin.) |
| **Vue Kanban** | Colonnes À faire / En cours / Terminé, glisser-déposer | Vue tableau par statut ou par personne, en plus de l'accueil et de la timeline. |
| **Échéance et responsable par étape** | Sous-tâches assignées avec date | Pouvoir dire « l'étape Chiffrage est pour Claire, avant le 12 ». |

### 🟠 Priorité moyenne — confort et pilotage

| Manque | Proposition |
|---|---|
| **Tableau de bord / statistiques** | Tâches terminées par mois, retards par personne, délai moyen par catégorie, devis envoyés / gagnés. |
| **Priorité et étiquettes** | Priorité (urgente / normale / basse) et étiquettes libres (client, région…). |
| **Champs métier** | Client, montant du devis, numéro de devis Business Central, adresse du chantier. |
| **Tâches récurrentes** | Entretien annuel, relances trimestrielles, salon chaque année : recréées automatiquement. |
| **Mentions @** | « @Claire peux-tu valider ? » dans un commentaire, avec notification. |
| **Glisser-déposer** | Déplacer une barre dans la timeline pour changer les dates ; réordonner étapes et groupes à la souris. |
| **Calendrier** | Vue mensuelle, et abonnement Outlook (lien iCal) pour voir les échéances dans l'agenda. |
| **Corbeille** | Une tâche supprimée récupérable 30 jours, au lieu d'une suppression définitive. |
| **Dépendances** | « Le chantier ne commence qu'après la livraison » ; décalage automatique. |

### 🟢 Plus tard — intégrations et entreprise

| Manque | Proposition |
|---|---|
| **Business Central** | Créer une tâche depuis un devis BC, retrouver la fiche client, suivre le montant. *Prévu dans le cahier des charges.* |
| **Double authentification** | Le site étant sur Internet, ajouter un second facteur (code par application) pour l'administrateur. |
| **Connexion Microsoft 365** | Se connecter avec son compte Microsoft (SSO) plutôt qu'un mot de passe dédié ; double authentification. |
| **Suivi du temps / charge** | Temps passé par tâche, charge par personne et par semaine. |
| **Rôles intermédiaires** | « Responsable de groupe » qui gère son groupe sans être administrateur. |
| **Sauvegarde externalisée automatique** | Copie quotidienne de la base hors d'OVH (OneDrive / SharePoint). |
| **Hors connexion** | Consulter ses tâches même sans Internet (cache sur la tablette). |

## Recommandation

Les trois plus utiles tout de suite, dans cet ordre :

1. **Résumé quotidien par e-mail ou Teams** (retards, échéances, tâches attribuées), pour ne plus rien laisser filer.
2. **Pièces jointes** (photos de chantier, PDF de devis).
3. **Modèles de tâches** pour les devis et chantiers types.

Ensuite : la vue Kanban, puis les statistiques.
