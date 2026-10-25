#!/usr/bin/env bash
# Déploiement du code vers l'hébergement OVH (ou une copie locale pour les tests).
#   deploiement/deployer.sh --cible=production|test [--migrer] [--source=DOSSIER] [--sans-verification-web]
# Principe (chaque version est un dossier séparé ; « current » est un lien qui pointe vers la version active) :
#   ~/projets/releases/AAAAMMJJ-HHMMSS-<commit>/   code (www/ + outils/*.php)
#   ~/projets/current                              → releases/…  (le domaine pointe sur projets/current/www)
#   ~/projets/config/config.php                    secrets (jamais touchés)
#   ~/projets/data/                                sauvegardes, état, fichiers (jamais touchés)
# Étapes : paquet → envoi → contrôle syntaxe → SAUVEGARDE VÉRIFIÉE (obligatoire) → bascule atomique → test d'accès → nettoyage.
# Les migrations de base ne sont appliquées que si --migrer est demandé (la base reste intacte sinon, et l'application affiche « mise à jour en attente »).
set -euo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; RACINE="$(dirname "$ICI")"
CIBLE=""; MIGRER=0; SOURCE="$RACINE"; VERIF_WEB=1; GARDER=5
for a in "$@"; do case "$a" in
  --cible=*) CIBLE="${a#*=}";; --migrer) MIGRER=1;; --source=*) SOURCE="${a#*=}";; --sans-verification-web) VERIF_WEB=0;; --garder=*) GARDER="${a#*=}";;
  *) echo "Option inconnue : $a" >&2; exit 2;; esac; done
[ -n "$CIBLE" ] || { echo "Indiquez --cible=production ou --cible=test" >&2; exit 2; }
ENVF="${DEPLOY_ENV_FILE:-$ICI/cibles/$CIBLE.env}"
# shellcheck disable=SC1090
[ -f "$ENVF" ] && source "$ENVF"
: "${MODE:=ssh}"; : "${REMOTE_BASE:=projets}"; : "${SITE_URL:=}"; : "${PHP_BIN:=php}"
if [ "$MODE" = ssh ]; then : "${SSH_HOST:?SSH_HOST manquant}"; : "${SSH_USER:?SSH_USER manquant}"; fi

# --- Exécution distante / locale ---
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=yes)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")
[ -n "${SSH_KNOWN_HOSTS:-}" ] && SSH_OPTS+=(-o "UserKnownHostsFile=$SSH_KNOWN_HOSTS")
[ -n "${SSH_PORT:-}" ] && SSH_OPTS+=(-p "$SSH_PORT")
run() { if [ "$MODE" = ssh ]; then ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "$@"; else bash -c "$*"; fi; }
envoyer() {  # envoyer FICHIER_LOCAL CHEMIN_DISTANT
  if [ "$MODE" = ssh ]; then scp -q "${SSH_OPTS[@]/#-p/-P}" "$1" "$SSH_USER@$SSH_HOST:$2"; else cp "$1" "$2"; fi; }
etape() { echo; echo "==> $*"; }
BASE="$REMOTE_BASE"
if [ "$MODE" = local ]; then BASE="$REMOTE_BASE"; fi

# --- 1. Paquet ---
etape "Préparation du paquet"
COMMIT="$(git -C "$SOURCE" rev-parse --short HEAD 2>/dev/null || echo sans-git)"
ID="$(date -u +%Y%m%d-%H%M%S)-$COMMIT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/paquet"
( cd "$SOURCE" && tar --exclude='www/config.php' --exclude='*.sql' --exclude='*.log' --exclude='.git' --exclude='node_modules' -cf - www outils/*.php ) | tar -xf - -C "$TMP/paquet"
VERSION="$(grep -o "APP_VERSION = '[^']*'" "$SOURCE/www/api/routes.php" | cut -d"'" -f2)"
printf '{"id":"%s","commit":"%s","version":"%s","cible":"%s","date":"%s"}\n' "$ID" "$COMMIT" "$VERSION" "$CIBLE" "$(date -u +%FT%TZ)" > "$TMP/paquet/RELEASE.json"
[ "$CIBLE" = production ] || printf 'User-agent: *\nDisallow: /\n' > "$TMP/paquet/www/robots.txt"
find "$TMP/paquet" -name '*.php' -print0 | xargs -0 -n1 "$PHP_BIN" -l >/dev/null   # le paquet doit être syntaxiquement valide AVANT d'être envoyé
tar -czf "$TMP/release.tar.gz" -C "$TMP/paquet" .
SHA="$(sha256sum "$TMP/release.tar.gz" | cut -d' ' -f1)"
echo "Version $VERSION ($COMMIT) — paquet $(du -h "$TMP/release.tar.gz" | cut -f1), empreinte ${SHA:0:12}…"

# --- 2. Envoi et déploiement dans un dossier neuf (la version en service n'est pas touchée) ---
etape "Envoi vers $CIBLE ($MODE)"
run "mkdir -p '$BASE/releases' '$BASE/config' '$BASE/data' && chmod 750 '$BASE/config' '$BASE/data'"
run "test -f '$BASE/config/config.php'" || { echo "ERREUR : $BASE/config/config.php n'existe pas sur la cible (copiez config.exemple.php et remplissez-le)." >&2; exit 1; }
envoyer "$TMP/release.tar.gz" "$BASE/releases/.arrivee-$ID.tar.gz"
run "set -e; cd '$BASE/releases'; echo '$SHA  .arrivee-$ID.tar.gz' | sha256sum -c - >/dev/null; mkdir '$ID'; tar -xzf '.arrivee-$ID.tar.gz' -C '$ID'; rm -f '.arrivee-$ID.tar.gz'; find '$ID' -type d -exec chmod 750 {} +; find '$ID' -type f -exec chmod 640 {} +"
echo "Paquet reçu et vérifié : $BASE/releases/$ID"

# --- 3. Contrôle sur la cible ---
etape "Contrôle du code sur la cible"
run "set -e; cd '$BASE/releases/$ID'; for f in \$(find . -name '*.php'); do $PHP_BIN -l \"\$f\" >/dev/null; done; echo 'Syntaxe PHP : OK'"
ANCIEN="$(run "readlink '$BASE/current' 2>/dev/null || true")"
[ -n "$ANCIEN" ] && echo "Version actuelle : $ANCIEN" || echo "Première installation : pas de version précédente."

# --- 4. Sauvegarde vérifiée OBLIGATOIRE ---
etape "Sauvegarde vérifiée avant déploiement (obligatoire)"
if run "cd '$BASE/releases/$ID' && $PHP_BIN outils/migrer.php" | grep -q "état : absent"; then
  echo "Base non installée : pas de sauvegarde à faire (utilisez installer.php)."
else
  run "cd '$BASE/releases/$ID' && $PHP_BIN outils/sauvegarde.php --raison=avant-deploiement" || { echo "ÉCHEC DE LA SAUVEGARDE : déploiement annulé, rien n'a été modifié." >&2; run "rm -rf '$BASE/releases/$ID'"; exit 1; }
fi

# --- 5. Bascule (atomique) ---
etape "Bascule vers la nouvelle version"
run "set -e; cd '$BASE'; ln -sfn 'releases/$ID' current.nouveau; mv -T current.nouveau current"
echo "En service : releases/$ID"

# --- 6. Migrations : seulement à la demande ---
ETAT="$(run "cd '$BASE/current' && $PHP_BIN outils/migrer.php" || true)"
echo "$ETAT"
if echo "$ETAT" | grep -q "état : ancien"; then
  if [ "$MIGRER" = 1 ]; then
    etape "Mise à jour de la base (sauvegarde préalable automatique)"
    run "cd '$BASE/current' && $PHP_BIN outils/migrer.php --appliquer" || { echo "ÉCHEC de la migration : retour à la version précédente du code." >&2; [ -n "$ANCIEN" ] && run "cd '$BASE' && ln -sfn '$ANCIEN' current.nouveau && mv -T current.nouveau current"; exit 1; }
  else
    echo "⚠ La base doit être mise à jour : l'application affichera « mise à jour en attente » jusqu'à ce que l'administrateur lance la mise à jour (maintenance.php) ou que ce déploiement soit relancé avec --migrer."
  fi
fi

# --- 7. Test d'accès ---
if [ "$VERIF_WEB" = 1 ] && [ -n "$SITE_URL" ]; then
  etape "Test d'accès à $SITE_URL"
  ok=0
  for i in 1 2 3 4 5; do
    code="$(curl -sS -o "$TMP/reponse.json" -w '%{http_code}' --max-time 20 "$SITE_URL/api/comptes" || true)"
    if [ "$code" = 200 ] || { [ "$code" = 503 ] && grep -q '"code":"schema"' "$TMP/reponse.json" 2>/dev/null && [ "$MIGRER" = 0 ]; }; then ok=1; break; fi
    sleep 3
  done
  if [ "$ok" != 1 ]; then
    echo "ÉCHEC du test d'accès (code $code) : retour automatique à la version précédente." >&2
    if [ -n "$ANCIEN" ]; then run "cd '$BASE' && ln -sfn '$ANCIEN' current.nouveau && mv -T current.nouveau current"; echo "Version précédente remise en service : $ANCIEN" >&2; fi
    exit 1
  fi
  echo "Réponse correcte (code $code)."
fi

# --- 8. Nettoyage : on garde les $GARDER dernières versions (jamais celle en service ni la précédente) ---
etape "Nettoyage des anciennes versions (on en garde $GARDER)"
run "set -e; cd '$BASE/releases'; en_service=\$(readlink '../current' | sed 's#.*/##'); ls -1d 20*/ 2>/dev/null | sed 's#/##' | sort -r | tail -n +$((GARDER+1)) | while read d; do [ \"\$d\" = \"\$en_service\" ] || { rm -rf \"\$d\"; echo \"supprimée : \$d\"; }; done; true"
echo; echo "✅ Déploiement terminé : $ID"
