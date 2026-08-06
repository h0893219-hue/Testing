#!/bin/zsh

set -u

SCRIPT_DIR=${0:A:h}
PORT=4173
URL="http://127.0.0.1:${PORT}"

cd "$SCRIPT_DIR" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 fehlt. Installiere Python 3 und starte den Launcher erneut."
  read -r "?Enter zum Schließen …"
  exit 1
fi

if curl --silent --fail --max-time 1 "${URL}/index.html" | grep -q "High Harvest"; then
  echo "High Harvest läuft bereits auf ${URL}"
  open "$URL"
  exit 0
fi

echo "High Harvest startet auf ${URL}"
echo "Dieses Fenster offen lassen. Mit Ctrl+C wird der Server beendet."
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/high-harvest-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

for _ in {1..40}; do
  if curl --silent --fail --max-time 1 "${URL}/index.html" >/dev/null; then
    open "$URL"
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.1
done

echo "Der lokale Server konnte nicht gestartet werden."
echo "Details: /tmp/high-harvest-server.log"
read -r "?Enter zum Schließen …"
exit 1
