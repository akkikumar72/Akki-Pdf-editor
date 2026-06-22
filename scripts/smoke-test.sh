#!/usr/bin/env bash
# Real-browser smoke test for Akki PDF Editor.
#
# Boots the Vite dev server, drives a headless Chromium via agent-browser
# (https://agent-browser.dev), uploads a real PDF, and asserts the editor
# loads it and renders without console errors. Screenshots are written to
# artifacts/smoke/.
#
# Usage:
#   bun run smoke                      # uses the committed pdf/sample-invoice.pdf
#   scripts/smoke-test.sh path/to.pdf  # use a different PDF
#   PORT=5180 scripts/smoke-test.sh    # override the dev-server port
#
# Requirements:
#   - agent-browser on PATH (npm i -g agent-browser) or runnable via npx.
#   - A Chromium/Chrome binary. Set AGENT_BROWSER_EXECUTABLE_PATH to point at
#     one; otherwise the script looks under $PLAYWRIGHT_BROWSERS_PATH, then
#     falls back to agent-browser's own managed Chrome.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PDF_PATH="${1:-$ROOT/pdf/sample-invoice.pdf}"
PORT="${PORT:-5173}"
BASE_URL="http://localhost:${PORT}"
ART="$ROOT/artifacts/smoke"
mkdir -p "$ART"

# Absolute path for the upload (agent-browser resolves relative to its daemon cwd).
case "$PDF_PATH" in /*) : ;; *) PDF_PATH="$ROOT/$PDF_PATH" ;; esac
[ -f "$PDF_PATH" ] || { echo "✗ PDF not found: $PDF_PATH"; exit 1; }
PDF_NAME="$(basename "$PDF_PATH")"

# Resolve the agent-browser CLI.
if command -v agent-browser >/dev/null 2>&1; then
  AB="agent-browser"
else
  AB="npx -y agent-browser"
fi
export AGENT_BROWSER_ARGS="${AGENT_BROWSER_ARGS:---no-sandbox,--disable-dev-shm-usage}"

# Resolve a Chromium executable if the user did not pin one.
if [ -z "${AGENT_BROWSER_EXECUTABLE_PATH:-}" ]; then
  CANDIDATE="$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)"
  [ -n "$CANDIDATE" ] && export AGENT_BROWSER_EXECUTABLE_PATH="$CANDIDATE"
fi
echo "• Chrome: ${AGENT_BROWSER_EXECUTABLE_PATH:-<agent-browser managed>}"
echo "• PDF:    $PDF_PATH"

DEV_PID=""
cleanup() {
  $AB close --all >/dev/null 2>&1 || true
  [ -n "$DEV_PID" ] && kill "$DEV_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Start the dev server and wait for it to answer.
echo "• Starting dev server on :$PORT ..."
bun run dev -- --port "$PORT" >"$ART/devserver.log" 2>&1 &
DEV_PID=$!
for _ in $(seq 1 40); do
  if curl -fsS -m 3 -o /dev/null "$BASE_URL/" 2>/dev/null; then break; fi
  sleep 0.5
done
curl -fsS -m 3 -o /dev/null "$BASE_URL/" || { echo "✗ dev server did not come up"; cat "$ART/devserver.log"; exit 1; }

fail() { echo "✗ $1"; $AB screenshot "$ART/failure.png" >/dev/null 2>&1 || true; exit 1; }

# 1) Landing page loads.
echo "• Opening landing page ..."
$AB open "$BASE_URL" >/dev/null
$AB viewport 1280 800 >/dev/null 2>&1 || true
$AB screenshot "$ART/01-landing.png" >/dev/null
TITLE="$($AB eval "document.title" 2>/dev/null | tr -d '"')"
echo "  title: $TITLE"
echo "$TITLE" | grep -qi "AkkiPDF" || fail "landing title missing 'AkkiPDF'"

# 2) Upload a real PDF through the hidden file input.
echo "• Uploading $PDF_NAME ..."
$AB upload "input[type=file]" "$PDF_PATH" >/dev/null || fail "file upload command failed"

# Wait until the app actually navigates to the editor route AND the page
# indicator is present — not the transient "Opening <file>..." landing status.
LOADED=""
for _ in $(seq 1 40); do
  STATE="$($AB eval "(location.pathname==='/pdf-editor' && /Page\\s+\\d+\\/\\d+/.test(document.querySelector('footer')?.innerText||'')) ? 'ready' : ''" 2>/dev/null | tr -d '"')"
  if [ "$STATE" = "ready" ]; then LOADED=1; break; fi
  sleep 0.5
done
[ -n "$LOADED" ] || fail "editor route never loaded the uploaded document ($PDF_NAME)"
$AB screenshot "$ART/02-editor.png" >/dev/null

# The editor header shows the loaded document's name.
$AB eval "document.body.innerText" 2>/dev/null | grep -q "$PDF_NAME" || fail "editor did not show document name ($PDF_NAME)"

# 3) Assert the editor state: document name + 2-page count from the fixture.
PAGES="$($AB eval "document.querySelector('footer')?.innerText.match(/Page\\s+\\d+\\/(\\d+)/)?.[1] || ''" 2>/dev/null | tr -d '"')"
echo "  document loaded: $PDF_NAME, pages: ${PAGES:-?}"
[ "$PAGES" = "2" ] || fail "expected 2 pages from the fixture, got '${PAGES:-?}'"

# 4) Assert no console errors occurred.
ERRORS="$($AB console 2>/dev/null | grep -iE "\[error\]|uncaught|exception" || true)"
[ -z "$ERRORS" ] || fail "console errors detected:
$ERRORS"

echo "✓ Smoke test passed — uploaded $PDF_NAME, editor rendered $PAGES pages, no console errors."
echo "  Screenshots in $ART/"
