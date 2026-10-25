#!/usr/bin/env bash
# Retour à une version précédente du CODE (la base de données n'est pas modifiée).
#   deploiement/retour-arriere.sh --cible=production [--vers=ID_DE_VERSION] [--forcer]
# Sans --vers : la version juste avant celle en service. Refuse si la base a été modifiée par une migration « cassante »
# que l'ancien code ne comprend pas (dans ce cas : restaurer la sauvegarde faite avant la mise à jour, voir docs/deploiement.md).
set -euo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIBLE=""; VERS=""; FORCER=0
for a in "$@"; do case "$a" in --cible=*) CIBLE="${a#*=}";; --vers=*) VERS="${a#*=}";; --forcer) FORCER=1;; *) echo "Option inconnue : $a" >&2; exit 2;; esac; done
[ -n "$CIBLE" ] || { echo "Indiquez --cible=production ou --cible=test" >&2; exit 2; }
ENVF="${DEPLOY_ENV_FILE:-$ICI/cibles/$CIBLE.env}"; [ -f "$ENVF" ] && source "$ENVF"   # shellcheck disable=SC1090
: "${MODE:=ssh}"; : "${REMOTE_BASE:=projets}"; : "${PHP_BIN:=php}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=yes)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY"); [ -n "${SSH_KNOWN_HOSTS:-}" ] && SSH_OPTS+=(-o "UserKnownHostsFile=$SSH_KNOWN_HOSTS"); [ -n "${SSH_PORT:-}" ] && SSH_OPTS+=(-p "$SSH_PORT")
run() { if [ "$MODE" = ssh ]; then ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "$@"; else bash -c "$*"; fi; }
BASE="$REMOTE_BASE"
ACTUEL="$(run "readlink '$BASE/current' | sed 's#.*/##'")"
echo "Versions disponibles (la plus récente en premier) :"; run "ls -1d '$BASE'/releases/20*/ | sed 's#.*/releases/##; s#/##' | sort -r" | sed "s/^/  /"
if [ -z "$VERS" ]; then VERS="$(run "ls -1d '$BASE'/releases/20*/ | sed 's#.*/releases/##; s#/##' | sort -r | grep -A1 -x '$ACTUEL' | tail -n1")"; fi
[ -n "$VERS" ] && [ "$VERS" != "$ACTUEL" ] || { echo "Aucune version précédente disponible." >&2; exit 1; }
run "test -d '$BASE/releases/$VERS'" || { echo "Version introuvable : $VERS" >&2; exit 1; }
# L'ancien code peut-il utiliser la base actuelle ?
ETAT="$(run "cd '$BASE/releases/$VERS' && $PHP_BIN outils/migrer.php" || true)"; echo "$ETAT"
if echo "$ETAT" | grep -q "état : incompatible" && [ "$FORCER" = 0 ]; then
  echo "REFUS : la base a été modifiée par une mise à jour que la version $VERS ne comprend pas. Restaurez la sauvegarde « avant-migration » (docs/sauvegardes.md) ou relancez avec --forcer en connaissance de cause." >&2; exit 1
fi
run "set -e; cd '$BASE'; ln -sfn 'releases/$VERS' current.nouveau; mv -T current.nouveau current"
echo "✅ Retour effectué : en service $VERS (remplace $ACTUEL). La base n'a pas été modifiée."
