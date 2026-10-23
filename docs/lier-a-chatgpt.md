# Lier Projets Le Roy à ChatGPT

Une fois relié, ChatGPT peut lire et faire avancer vos tâches, comme Claude :

- « Qu'est-ce qui est en retard ? »
- « Crée un devis pour l'élevage Dupont dans Le Roy, à rendre le 30/11, avec les étapes visite, chiffrage, envoi. »
- « Coche l'étape visite du devis Dupont. »

ChatGPT agit **avec les droits de la clé** utilisée : il voit ce que la personne voit, et ses actions sont notées
dans l'historique à son nom. Il **ne peut rien supprimer**.

## Différence importante avec Claude

| | Claude (application pour ordinateur) | ChatGPT |
|---|---|---|
| Où tourne le lien | Sur le PC, dans le réseau du bureau | Sur les serveurs d'OpenAI, sur Internet |
| Ce qu'il faut ouvrir | Rien | Un **tunnel HTTPS sécurisé** vers le connecteur, pendant l'utilisation |
| Abonnement | Claude (gratuit ou payant) | ChatGPT **payant** (Plus, Pro, Business, Enterprise, Edu), avec le **mode développeur** |

ChatGPT ne sait joindre que des outils accessibles depuis Internet. Or Projets Le Roy est volontairement limité
au réseau du bureau. La solution retenue garde cette protection :

- l'application elle-même **reste fermée** à Internet ;
- seul un petit **connecteur à part** (port 3001, uniquement sur le PC serveur) peut être ouvert, et il ne donne accès
  qu'aux outils de tâches, jamais aux pages de l'application ;
- chaque demande doit porter une **clé d'accès personnelle** ; 20 essais avec une mauvaise clé bloquent l'adresse 10 minutes ;
- le connecteur est **désactivé par défaut** (réglage administrateur) ;
- l'ouverture vers Internet ne dure **que tant que la fenêtre** `ouvrir-pour-chatgpt.bat` est ouverte.

## Étape 1 — Activer le connecteur (administrateur, une seule fois)

Dans l'application : **Compte** → bas de la partie « Lier à Claude ou ChatGPT » → **Activer le connecteur ChatGPT**.

## Étape 2 — Créer une clé d'accès

Connecté avec **le compte de la personne** qui utilisera ChatGPT : **Compte** → **Créer une clé d'accès**
(nommez-la par exemple « ChatGPT »), puis **Copier la clé**.

## Étape 3 — Ouvrir le tunnel (sur le PC serveur)

1. Double-cliquez sur **`ouvrir-pour-chatgpt.bat`**.
2. La première fois, il télécharge l'outil de tunnel officiel de Cloudflare (`cloudflared`, environ 60 Mo).
3. Collez la clé (clic droit), puis Entrée.
4. Une adresse s'affiche, de la forme :
   `https://quelque-chose.trycloudflare.com/mcp/lr_…`
   C'est **l'adresse à coller dans ChatGPT**. Elle contient la clé : ne la partagez pas.
5. **Laissez la fenêtre ouverte** tant que vous utilisez ChatGPT. La fermer coupe l'accès.

> L'adresse change à chaque ouverture du tunnel : il faut alors la mettre à jour dans ChatGPT.
> Pour une adresse fixe et permanente, votre prestataire informatique peut créer un « tunnel nommé » Cloudflare
> (compte Cloudflare et nom de domaine nécessaires) pointant vers `http://127.0.0.1:3001`.

## Étape 4 — Ajouter le connecteur dans ChatGPT

Les noms des menus peuvent varier selon la version de ChatGPT.

1. ChatGPT → **Paramètres** → **Applications et connecteurs** (« Apps & Connectors »).
2. **Paramètres avancés** → activez le **Mode développeur** (« Developer mode »).
   Sur un abonnement Business / Enterprise, l'administrateur de l'espace ChatGPT doit l'autoriser.
3. **Créer** (« Create ») un connecteur :
   - Nom : `Projets Le Roy`
   - Description : `Projets et tâches de l'équipe Le Roy`
   - URL du serveur MCP : l'adresse affichée à l'étape 3
   - Authentification : **Aucune** (« No authentication ») — la clé est déjà dans l'adresse
   - Cochez « Je fais confiance à cette application », puis **Créer**.
4. Dans une conversation : bouton **+** → **Mode développeur** (ou « Plus ») → activez **Projets Le Roy**.
5. Demandez : « Quelles sont mes tâches en retard ? »

## Outils disponibles

Les mêmes que pour Claude : `resume_taches`, `lister_taches`, `voir_tache`, `creer_tache`, `modifier_tache`,
`cocher_etape`, `ajouter_etape`, `marquer_terminee`, `commenter`, `infos_equipe`,
plus `search` et `fetch` (format attendu par la recherche de ChatGPT).

## Arrêter l'accès

- **Temporairement** : fermez la fenêtre `ouvrir-pour-chatgpt.bat`.
- **Pour une personne** : supprimez sa clé (page Compte, corbeille).
- **Pour tout le monde** : Compte → **Désactiver** le connecteur ChatGPT.

## En cas de souci

| Message | Que faire |
|---|---|
| « Le connecteur ChatGPT est désactivé » | Étape 1 (administrateur). |
| « L'application ne tourne pas sur ce PC » | Lancez `demarrer-en-arriere-plan.bat`, puis recommencez. |
| ChatGPT indique qu'il ne peut pas joindre le serveur | La fenêtre du tunnel a été fermée, ou l'adresse a changé : relancez `ouvrir-pour-chatgpt.bat` et mettez à jour l'adresse dans ChatGPT. |
| « Clé d'accès absente ou refusée » | La clé a été supprimée ou le compte désactivé : créez une nouvelle clé et refaites les étapes 3 et 4. |
| « Trop d'essais » | Trop de tentatives avec une mauvaise clé : attendez 10 minutes. |
| Le mode développeur n'apparaît pas | Il faut un abonnement ChatGPT payant ; en entreprise, l'administrateur ChatGPT doit l'autoriser. |
