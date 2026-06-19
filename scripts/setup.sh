#!/usr/bin/env bash
# ============================================================================
# setup.sh — One-command full project setup (deps + env files)
# ============================================================================
# Usage:
#   ./scripts/setup.sh               # interactive, defaults
#   ./scripts/setup.sh --force        # overwrite existing .env files
#   ./scripts/setup.sh --no-start     # install only, don't run anything
# ============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

FORCE=false
DO_START=true

for arg in "$@"; do
  case "$arg" in
    --force)       FORCE=true ;;
    --no-start)    DO_START=false ;;
    *)             ;;
  esac
done

info()  { echo -e "\033[1;34m[INFO] \033[0m$*"; }
ok()    { echo -e "\033[1;32m[OK]   \033[0m$*" ; }

# ---- Python deps ----------------------------------------------------------
info "Setting up backend (Python)..."

if [ ! -d "$BACKEND_DIR/venv" ]; then
  python3 -m venv "$BACKEND_DIR/venv"
  ok "Virtual environment created"
fi

source "$BACKEND_DIR/venv/bin/activate"

# PyTorch — try CUDA variant first, fall back to CPU
if ! pip show torch >/dev/null 2>&1; then
  info "Installing PyTorch (CPU variant). For GPU, run:"
  echo "    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121"
  pip install "torch>=2.0.0" >/dev/null 2>&1
fi

if [ -f "$BACKEND_DIR/requirements.txt" ]; then
  pip install -r "$BACKEND_DIR/requirements.txt" -q
  ok "Backend dependencies installed"
fi

# ---- Node deps ------------------------------------------------------------
info "Setting up frontend (Node.js)..."

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  (cd "$FRONTEND_DIR" && npm install)
  ok "Frontend dependencies installed"
else
  info "node_modules already exists — skipping npm install"
fi

# ---- .env files -----------------------------------------------------------
init_env() {
  local env_path="$1" force="$2"
  if [ -f "$env_path" ] && [ "$force" = false ]; then
    info "$env_path already exists (use --force to overwrite)"
    return 0
  fi

  case "$env_path" in
    *backend*/*)
      cat > "$env_path" << 'ENV'
# ── Server ───────────────────────────────────────────────
OCR_HOST=localhost
OCR_PORT=8000
OCR_WORKERS=1
OCR_RELOAD=false
OCR_LOG_LEVEL=INFO

# ── Compute ──────────────────────────────────────────────
OCR_DEVICE=auto          # cpu | cuda | auto
OCR_YOLO_DEVICE=auto
OCR_CONF_THRESHOLD=0.2
OCR_IMG_SIZE=1280

# ── File Limits ──────────────────────────────────────────
OCR_MAX_FILE_SIZE_MB=500
OCR_MAX_BATCH_FILES=10
OCR_PDF_DPI=300

# ── Caching ──────────────────────────────────────────────
OCR_CACHE_ENABLED=true
OCR_CACHE_TTL=3600

# ── Rate Limiting ────────────────────────────────────────
OCR_RATE_LIMIT_ENABLED=true
OCR_RATE_LIMIT_REQUESTS=60
OCR_RATE_LIMIT_WINDOW=60

# ── Security ─────────────────────────────────────────────
OCR_API_KEYS=            # comma-separated keys (leave empty to disable)
OCR_CORS_ORIGINS=*

# ── Text Cleaning ────────────────────────────────────────
OCR_TEXT_CLEANING_ENABLED=true
URDUTEXT_AUTOCORRECT_ENABLED=true
URDUTEXT_AUTOCORRECT_MODE=hybrid
SPELL_CHECK_MAX_DISTANCE=3
SPELL_CHECK_USE_WORD_FREQ=true
SPELL_CHECK_CONFIDENCE_THRESHOLD=0.35
SPELL_CHECK_SENTENCE_AWARE=true
SPELL_CHECK_PROTECT_ENGLISH=true
ENV
      ;;
    *frontend*/*)
      cat > "$env_path" << 'ENV'
# ── Backend API URL (used by Vite proxy) ────────────────
VITE_API_WS_HOST=localhost:8000

# ── Frontend port (optional — defaults to 5173) ─────────
# VITE_PORT=5173
ENV
      ;;
  esac
  ok "Created $env_path"
}

if [ ! -f "$BACKEND_DIR/.env" ] || [ "$FORCE" = true ]; then
  init_env "$BACKEND_DIR/.env" "$FORCE"
fi

if [ ! -f "$FRONTEND_DIR/.env" ] || [ "$FORCE" = true ]; then
  init_env "$FRONTEND_DIR/.env" "$FORCE"
fi

ok "Setup complete!"

if [ "$DO_START" = true ]; then
  echo ""
  info "To start both servers, run:"
  echo "    ./scripts/run.sh"
  echo ""
  info "Or just the backend:"
  echo "    cd backend && ./start-server.sh"
  echo ""
  info "Or just the frontend:"
  echo "    cd frontend && npm run dev"
fi
