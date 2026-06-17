#!/bin/bash
# Start the v2 Urdu OCR server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Urdu OCR v2 Server ==="

# Load env if .env exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "[v2] Loaded .env file"
fi

cd "$SCRIPT_DIR" || exit 1

echo "Starting server on ${OCR_HOST:-localhost}:${OCR_PORT:-8000} ..."

uvicorn v2.main:app --app-dir "$SCRIPT_DIR" --host "${OCR_HOST:-localhost}" --port "${OCR_PORT:-8000}" --reload
