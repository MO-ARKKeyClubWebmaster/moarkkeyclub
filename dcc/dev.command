#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  MO-ARK Officer Portal — local dev server
#  Double-click this file (or run it in Terminal) to preview the
#  portal at http://localhost:5173 before pushing to GitHub.
#  Ctrl-C in the window to stop.
# ─────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
PORT=5173
echo ""
echo "  MO-ARK Officer Portal — dev server"
echo "  Serving this folder at:  http://localhost:$PORT"
echo "  (leave this window open; press Ctrl-C to stop)"
echo ""
# open the browser a moment after the server starts
( sleep 1; (open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null) ) &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l "$PORT" .
else
  echo "No python or node found. Install Python 3, then run this again."
  read -r _
fi
