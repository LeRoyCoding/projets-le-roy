#!/usr/bin/env bash
# Récupère chaque jour les sauvegardes chiffrées de l'hébergement OVH (le serveur interne VA CHERCHER : OVH n'a aucun accès chez nous),
# vérifie leur intégrité, applique la rotation 30 jours / 12 semaines / 12 mois, surveille leur fraîcheur et teste la restauration.
# À lancer chaque jour par cron :  15 4 * * *  /opt/projets-le-roy/serveur-interne/recuperer-sauvegardes.sh
# Utilisation : recuperer-sauvegardes.sh [fichier.conf]
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${1:-/etc/projets-le-roy/sauvegarde.conf}"
# shellcheck disable=SC1090
set -a
source "$CONF" || { echo "Configuration illisible : $CONF" >&2; exit 2; }
set +a
: "${DEST_DIR:?DEST_DIR manquant}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-30}"
mkdir -p "$DEST_DIR/quotidien" "$DEST_DIR/incoming"
LOG_FILE="${LOG_FILE:-$DEST_DIR/sauvegarde.log}"
# shellcheck source=alerter.sh
source "$ICI/alerter.sh"
log() { echo "$(date -Is) $*" | tee -a "$LOG_FILE"; }

exec 9>"$DEST_DIR/.verrou"
flock -n 9 || { log "Une récupération est déjà en cours."; exit 0; }

# 1) Récupération (sans jamais effacer côté OVH)
log "Récupération des sauvegardes…"
if [ -n "${SOURCE_LOCAL:-}" ]; then
  rsync -a --exclude '*.part' --compare-dest="$DEST_DIR/quotidien" "$SOURCE_LOCAL/" "$DEST_DIR/incoming/"; rc=$?
else
  SSH="ssh -i ${SSH_KEY:?} -p ${REMOTE_PORT:-22} -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${SSH_KNOWN_HOSTS:?}"
  rsync -a -e "$SSH" --exclude '*.part' --compare-dest="$DEST_DIR/quotidien" "${REMOTE_USER:?}@${REMOTE_HOST:?}:${REMOTE_DIR:?}/" "$DEST_DIR/incoming/"; rc=$?
  if [ $rc -ne 0 ]; then   # certains hébergements n'ont pas rsync : on essaie scp
    log "rsync a échoué (code $rc), essai avec scp…"
    scp -p -i "$SSH_KEY" -P "${REMOTE_PORT:-22}" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$SSH_KNOWN_HOSTS" \
      "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/projets-*" "$DEST_DIR/incoming/"; rc=$?
  fi
fi
if [ $rc -ne 0 ]; then alerter "Récupération des sauvegardes impossible" "Le serveur interne n'a pas pu récupérer les sauvegardes sur l'hébergement (code $rc). Voir $LOG_FILE."; fi

# 2) Vérification de chaque fichier reçu, puis rangement
nouveaux=0; mauvais=0
shopt -s nullglob
for m in "$DEST_DIR"/incoming/projets-*.manifest.json; do
  base="$(basename "$m" .manifest.json)"
  fichier="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["file"])' "$m" 2>/dev/null)"
  attendu="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$m" 2>/dev/null)"
  if [ -z "$fichier" ] || [ ! -f "$DEST_DIR/incoming/$fichier" ]; then continue; fi   # transfert pas terminé : on réessaiera
  reel="$(sha256sum "$DEST_DIR/incoming/$fichier" | cut -d' ' -f1)"
  if [ "$reel" != "$attendu" ]; then
    mauvais=$((mauvais+1)); alerter "Sauvegarde corrompue" "Le fichier $fichier ne correspond pas à son empreinte (reçu $reel, attendu $attendu). Il est écarté."
    rm -f "$DEST_DIR/incoming/$fichier" "$m"; continue
  fi
  if [ ! -f "$DEST_DIR/quotidien/$(basename "$m")" ]; then nouveaux=$((nouveaux+1)); log "Reçu et vérifié : $fichier"; fi
  mv -f "$DEST_DIR/incoming/$fichier" "$DEST_DIR/quotidien/$fichier"; mv -f "$m" "$DEST_DIR/quotidien/"
  chmod 600 "$DEST_DIR/quotidien/$fichier" "$DEST_DIR/quotidien/$base.manifest.json"
done

# 3) Rotation 30 jours / 12 semaines / 12 mois
python3 "$ICI/retention.py" "$DEST_DIR/quotidien" --appliquer | tee -a "$LOG_FILE" || alerter "Rotation des sauvegardes refusée" "La rotation a été bloquée par un garde-fou (voir $LOG_FILE)."

# 4) Fraîcheur : la plus récente doit avoir moins de MAX_AGE_HOURS heures (détecte aussi une tâche CRON OVH désactivée)
recent="$(python3 - "$DEST_DIR/quotidien" <<'PY'
import glob, json, sys, datetime as dt
best = None
for f in glob.glob(sys.argv[1] + "/*.manifest.json"):
    m = json.load(open(f))
    t = dt.datetime.strptime(m["created_at"].replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
    best = max(best, t) if best else t
print(int((dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - best).total_seconds() // 3600) if best else -1)
PY
)"
if [ "$recent" -lt 0 ]; then alerter "Aucune sauvegarde" "Aucune sauvegarde n'est présente sur le serveur interne."
elif [ "$recent" -gt "$MAX_AGE_HOURS" ]; then alerter "Sauvegarde trop ancienne" "La dernière sauvegarde a $recent heures (limite : $MAX_AGE_HOURS h). La tâche planifiée de l'hébergement s'est peut-être arrêtée."; fi

# 5) Test de restauration, chaque dimanche (ou si le fichier .tester existe)
if [ "${RESTORE_TEST:-0}" = "1" ] && { [ "$(date +%u)" = "7" ] || [ -f "$DEST_DIR/.tester" ]; }; then
  rm -f "$DEST_DIR/.tester"
  log "Test de restauration sur une base isolée…"
  if out="$(python3 "$ICI/tester-restauration.py" "$DEST_DIR/quotidien" 2>&1)"; then log "$out"; else alerter "TEST DE RESTAURATION ÉCHOUÉ" "$out"; fi
fi
log "Terminé : $nouveaux nouvelle(s) sauvegarde(s), $mauvais écartée(s)."
