# Projets Le Roy

Application de suivi des projets et des tâches pour l'équipe Le Roy / Lead Le Roy Concept.

Elle tourne sur **un PC du bureau** (le « PC serveur », toujours allumé).
Les collègues l'ouvrent dans leur navigateur depuis le même Wi-Fi, sans rien installer.

---

## 1. Préparer le PC serveur (une seule fois)

1. **Installer Node.js** : <https://nodejs.org/fr/download> → bouton « LTS » → installer avec les options par défaut.
2. **Installer Git** : <https://git-scm.com/download/win> → installer avec les options par défaut.
3. **Récupérer l'application** :
   - ouvrez le menu Démarrer, tapez `cmd` puis Entrée ;
   - dans la fenêtre noire, tapez (ou collez) ces deux lignes, chacune suivie d'Entrée :
     ```
     cd C:\
     git clone https://github.com/LeRoyCoding/projets-le-roy.git ProjetsLeRoy
     ```
   - si une fenêtre GitHub demande de vous connecter, connectez-vous avec le compte qui a accès au dépôt.
   - L'application est maintenant dans le dossier `C:\ProjetsLeRoy`.

## 2. Les trois scripts à double-cliquer

Tous se trouvent dans `C:\ProjetsLeRoy`.

### `installer.bat` — à faire une fois

Vérifie que Node.js est présent, puis installe les composants nécessaires.
Attendez le message **« Installation terminée »**, puis appuyez sur une touche.

### `demarrer.bat` — lance l'application

Une fenêtre noire s'ouvre et affiche :

```
   Projets Le Roy est démarré
   Sur ce PC          : http://localhost:3000
   Pour les collègues : http://192.168.1.25:3000
```

- **Laissez cette fenêtre ouverte** (vous pouvez la réduire). La fermer arrête l'application.
- Donnez aux collègues l'adresse de la ligne « Pour les collègues ».
- La toute première fois, Windows peut demander d'autoriser « Node.js » dans le pare-feu :
  cochez **Réseaux privés** et cliquez sur **Autoriser**. Sans cela, les collègues ne pourront pas se connecter.

### `mettre-a-jour.bat` — installe la dernière version

À lancer quand une nouvelle version a été publiée sur GitHub.
Il arrête le serveur, récupère la nouvelle version, réinstalle les composants et relance le serveur.
**Les données ne sont jamais touchées.**

## 3. Démarrage automatique avec Windows (conseillé)

- Double-cliquez sur `activer-demarrage-auto.bat` : le serveur se lancera tout seul (fenêtre réduite) à chaque ouverture de session sur le PC serveur.
- Pour annuler : `desactiver-demarrage-auto.bat`.

Pensez à régler le PC serveur pour qu'il **ne se mette pas en veille** (Paramètres → Système → Alimentation).

## 4. Première connexion

1. Sur le PC serveur, ouvrez <http://localhost:3000>.
2. Cliquez sur **Administrateur**, mot de passe **`admin`**.
3. Allez dans **Compte** → changez tout de suite ce mot de passe.
4. Toujours dans **Compte**, ajoutez chaque membre de l'équipe (nom + mot de passe). Chacun reçoit automatiquement son groupe « Perso ».
5. Dans **+ Groupe**, créez les groupes communs (par exemple « Le Roy », « LLC ») et cochez leurs membres.

## 5. Installer l'application sur les postes des collègues

Sur chaque PC ou tablette, ouvrez l'adresse donnée par `demarrer.bat` (par exemple `http://192.168.1.25:3000`) dans **Chrome** ou **Edge**, puis :

- si une icône « Installer » apparaît dans la barre d'adresse, cliquez dessus ;
- sinon, menu **⋮** → **Caster, enregistrer et partager** → **Créer un raccourci…** → cochez **Ouvrir dans une fenêtre** → **Créer**.

L'application apparaît alors avec l'icône Le Roy, comme un vrai logiciel.

## 6. Données et sauvegardes

- Les données sont dans `C:\ProjetsLeRoy\donnees\projets.sqlite` (un seul fichier).
- Chaque jour, une copie est faite automatiquement dans `C:\ProjetsLeRoy\sauvegardes\` (les 60 derniers jours sont gardés).
  Pour plus de sécurité, copiez de temps en temps ce dossier sur une clé USB ou un disque réseau.
- **Restaurer une sauvegarde** : arrêtez le serveur (fermez la fenêtre noire), remplacez `donnees\projets.sqlite` par la sauvegarde choisie (renommée `projets.sqlite`), supprimez `projets.sqlite-wal` et `projets.sqlite-shm` s'ils existent, puis relancez `demarrer.bat`.
- Ces fichiers ne sont jamais envoyés sur GitHub.

L'application n'est accessible que depuis le réseau local du bureau, pas depuis Internet.

---

## Pour essayer sans toucher aux vraies données (mode démo)

Dans une fenêtre `cmd` ouverte dans le dossier : `npm run demo`.
L'application démarre avec les exemples de la maquette (mot de passe `0000`, Administrateur `admin`),
dans un fichier séparé `donnees\demo.sqlite`.

## Informations techniques

- Serveur Node.js (Express) dans `server/`, base SQLite intégrée à Node.js (version 22.13 ou plus récente).
- Interface dans `public/` (HTML/CSS/JS sans framework), reprise fidèlement de `prototype.html` (maquette de référence).
- Mises à jour en temps réel entre les postes (Server-Sent Events).
- Mots de passe hachés (bcrypt), session par cookie.
- Port modifiable avec la variable d'environnement `PORT`.
