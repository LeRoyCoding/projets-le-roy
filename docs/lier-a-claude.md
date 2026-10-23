# Lier Projets Le Roy à Claude

Une fois reliée, l'application **Claude pour ordinateur** (Claude Desktop) peut lire et faire avancer vos tâches.
Vous lui parlez normalement, en français :

- « Qu'est-ce qui est en retard ? Résume-moi la semaine. »
- « Crée un devis pour l'élevage Martin dans Le Roy, pour Claire, à rendre le 15/11, avec les étapes visite, chiffrage, envoi. »
- « Coche l'étape chiffrage du devis Martin et ajoute un commentaire : client rappelé. »
- « Quelles tâches de Julien finissent ce mois-ci ? »

Claude agit **avec vos droits** : il voit exactement ce que vous voyez dans l'application, ni plus ni moins.
Chaque action est notée dans l'historique des tâches, à votre nom.

## Ce qu'il faut

- L'application **Claude Desktop** installée sur le PC (<https://claude.ai/download>) et connectée à votre compte Claude.
- **Node.js** sur ce même PC (<https://nodejs.org/fr/download>, version LTS).
- Être sur le **réseau du bureau** (l'application Le Roy n'est pas accessible depuis Internet).

## Étape 1 — Créer une clé d'accès

1. Dans Projets Le Roy : **Compte** → **Lier à Claude** → **Créer une clé d'accès**.
2. Une clé s'affiche (elle commence par `lr_`). **Copiez-la** : elle ne sera plus jamais affichée.

Vous pouvez supprimer une clé à tout moment (corbeille) : Claude perd alors l'accès immédiatement.

## Étape 2 — Relier Claude

### Sur le PC serveur (ou tout PC qui a le dossier `C:\ProjetsLeRoy`)

1. Double-cliquez sur **`lier-a-claude.bat`**.
2. Indiquez l'adresse de l'application (Entrée pour garder `http://localhost:3000` sur le PC serveur ;
   sur un autre PC, tapez l'adresse donnée par `demarrer-en-arriere-plan.bat`, par exemple `http://192.168.1.25:3000`).
3. Collez la clé (clic droit dans la fenêtre noire), puis Entrée.
4. Le script vérifie la connexion, puis ajoute « projets-le-roy » à la configuration de Claude (il garde une copie de l'ancienne).

### Sur un autre PC

1. Téléchargez le dossier de l'application : <https://github.com/LeRoyCoding/projets-le-roy> → **Code** → **Download ZIP**,
   décompressez-le dans `C:\ProjetsLeRoy` (pas besoin de lancer `installer.bat` : le connecteur n'a besoin de rien d'autre que Node.js).
2. Suivez la méthode ci-dessus.

### À la main (si vous préférez)

Dans Claude Desktop : **Paramètres → Développeur → Modifier la configuration**, et ajoutez (la page Compte affiche ce texte déjà rempli) :

```json
{
  "mcpServers": {
    "projets-le-roy": {
      "command": "node",
      "args": ["C:\\ProjetsLeRoy\\outils\\claude-mcp.js"],
      "env": {
        "PROJETS_URL": "http://192.168.1.25:3000",
        "PROJETS_CLE": "lr_…votre clé…"
      }
    }
  }
}
```

## Étape 3 — Redémarrer Claude

Quittez **complètement** Claude (clic droit sur son icône près de l'horloge → **Quitter**), puis rouvrez-le.
Dans une nouvelle conversation, l'icône des outils doit montrer **projets-le-roy**. Essayez : « Quelles sont mes tâches en retard ? »

## Ce que Claude peut faire

| Outil | Rôle |
|---|---|
| `resume_taches` | Situation : en retard, sous 7 jours, en cours |
| `lister_taches` | Liste filtrée (recherche, groupe, personne, catégorie, statut) |
| `voir_tache` | Détail : étapes, commentaires, historique |
| `creer_tache` | Créer une tâche avec ses étapes |
| `modifier_tache` | Changer titre, dates, responsable, groupe, catégorie, description |
| `cocher_etape` | Cocher / décocher une étape |
| `ajouter_etape` | Ajouter une étape |
| `marquer_terminee` | Clore une tâche sans étapes |
| `commenter` | Ajouter un commentaire |
| `infos_equipe` | Groupes, personnes et catégories |

Par prudence, Claude **ne peut pas supprimer** de tâche : cela reste à faire dans l'application.

## Et Claude sur le web (claude.ai) ?

Claude sur le web fonctionne dans le cloud et ne peut pas joindre un PC du réseau du bureau : seule l'application
Claude pour ordinateur, installée sur un PC du bureau, peut se relier à Projets Le Roy. Pour l'ouvrir depuis l'extérieur,
il faudrait exposer l'application sur Internet (VPN, tunnel sécurisé…), ce qui n'est volontairement pas prévu.

## En cas de souci

| Message | Que faire |
|---|---|
| « L'application ne répond pas » | Le PC serveur est éteint ou vous n'êtes pas sur le réseau du bureau ; vérifiez l'adresse. |
| « Clé d'accès refusée » | La clé a été supprimée ou le compte désactivé : créez une nouvelle clé et relancez `lier-a-claude.bat`. |
| Claude ne montre pas l'outil | Quittez complètement Claude et rouvrez-le. Vérifiez que Node.js est installé. |
