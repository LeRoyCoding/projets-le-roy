#!/usr/bin/env bash
# alerter "sujet" "message" — écrit dans le journal, puis prévient par e-mail et/ou webhook si configurés.
alerter() {
  local sujet="$1" message="$2"
  echo "$(date -Is) ALERTE : $sujet — $message" | tee -a "${LOG_FILE:-/dev/null}" >&2
  if [ -n "${ALERT_EMAIL:-}" ]; then
    if command -v mail >/dev/null 2>&1; then printf '%s\n' "$message" | mail -s "[Projets Le Roy] $sujet" "$ALERT_EMAIL" || true
    elif command -v sendmail >/dev/null 2>&1; then printf 'To: %s\nSubject: [Projets Le Roy] %s\nContent-Type: text/plain; charset=utf-8\n\n%s\n' "$ALERT_EMAIL" "$sujet" "$message" | sendmail -t || true
    fi
  fi
  if [ -n "${ALERT_WEBHOOK:-}" ]; then
    python3 - "$sujet" "$message" "$ALERT_WEBHOOK" <<'PY' || true
import json, sys, urllib.request
sujet, message, url = sys.argv[1:4]
corps = json.dumps({"text": f"🚨 Projets Le Roy — {sujet}\n{message}"}).encode()
urllib.request.urlopen(urllib.request.Request(url, corps, {"Content-Type": "application/json"}), timeout=20)
PY
  fi
}
