#!/usr/bin/env bash
# ============================================================================
# run.sh — Start both backend and frontend servers concurrently
# ============================================================================
# Usage:
#   ./scripts/run.sh              # starts both on defaults
#   ./scripts/run.sh backend      # start only the backend
#   ./scripts/run.sh frontend     # start only the frontend
#   ./scripts/run.sh --setup      # run full setup (deps + env init) then start
# ============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

MODE="both"  # both | backend | frontend

# ---- Parse args -----------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --setup) MODE="setup" ;;
    backend) MODE="backend" ;;
    frontend) MODE="frontend" ;;
    --help|-h)
      echo "Usage: ./scripts/run.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (none)         Start both servers concurrently"
      echo "  backend        Start only the backend server"
      echo "  frontend       Start only the frontend dev server"
      echo "  --setup        Run full setup (deps + env init) then start both"
      echo "  --help, -h     Show this help"
      exit 0
      ;;
  esac
done

# ---- Helpers ------------------------------------------------------------
info()  { echo -e "\033[1;34m[INFO] \033[0m$*"; }
ok()    { echo -e "\033[1;32m[OK]   \033[0m$*"; }
warn()  { echo -e "\033[1;33m[WARN] \033[0m$*" >&2; }
fail()  { echo -e "\033[1;31m[FAIL] \033[0m$*" >&2; exit 1; }

# ---- Setup ---------------------------------------------------------------
run_setup() {
  info "Running full setup..."

  # -- Backend deps --------------------------------------------------------
  if [ ! -d "$BACKEND_DIR/venv" ]; then
    info "Creating Python virtualenv in backend/"
    python3 -m venv "$BACKEND_DIR/venv"
  fi
  source "$BACKEND_DIR/venv/bin/activate"

  # Install torch first (largest dep) with a hint for CUDA users
  if ! pip show torch >/dev/null 2>&1; then
    info "Installing PyTorch (this may take a few minutes)..."
    pip install "torch>=2.0.0" "ultralytics>=8.0.0" >/dev/null 2>&1
    ok "PyTorch installed"
  fi

  # Install remaining deps
  if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    pip install -r "$BACKEND_DIR/requirements.txt" -q
    ok "Backend Python dependencies installed"
  fi

  # -- Frontend deps -------------------------------------------------------
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Installing frontend npm dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
    ok "Frontend npm dependencies installed"
  fi

  # -- Init .env files -----------------------------------------------------
  local env_templates=(
    "$BACKEND_DIR/.env.example:$BACKEND_DIR/.env"
    "$FRONTEND_DIR/.env.example:$FRONTEND_DIR/.env"
  )
  for pair in "${env_templates[@]}"; do
    IFS=':' read -r src dst <<< "$pair"
    if [ ! -f "$dst" ] && [ -f "$src" ]; then
      cp "$src" "$dst"
      info "Copied $src -> $dst (edit as needed)"
    elif [ ! -f "$dst" ]; then
      warn "No $src found; creating minimal $dst"
      touch "$dst"
    fi
  done

  ok "Setup complete"
}

# ---- Start servers -------------------------------------------------------
start_backend() {
  info "Starting backend on port 8000..."
  cd "$BACKEND_DIR"
  source venv/bin/activate 2>/dev/null || true
  export OCR_DEVICE="${OCR_DEVICE:-auto}"
  bash start-server.sh &
  BACKEND_PID=$!
  info "Backend PID: $BACKEND_PID"
}

start_frontend() {
  info "Starting frontend dev server on port 5173..."
  cd "$FRONTEND_DIR"
  npm run dev &
  FRONTEND_PID=$!
  info "Frontend PID: $FRONTEND_PID"
}

stop_all() {
  echo ""
  warn "Shutting down servers..."
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null
  echo "All servers stopped."
}

trap stop_all EXIT INT TERM

# ---- Main -----------------------------------------------------------------
case "$MODE" in
  setup)
    run_setup
    start_backend
    start_frontend
    info "Both servers are running. Press Ctrl+C to stop."
    wait
    ;;
  backend)
    if [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
      fail "backend directory not found or requirements.txt missing"
    fi
    run_setup >/dev/null 2>&1 || true
    start_backend
    info "Backend is running. Press Ctrl+C to stop."
    wait
    ;;
  frontend)
    if [ ! -f "$FRONTEND_DIR/package.json" ]; then
      fail "frontend directory not found or package.json missing"
    fi
    run_setup >/dev/null 2>&1 || true
    start_frontend
    info "Frontend is running. Press Ctrl+C to stop."
    wait
    ;;
  both|*)
    # Verify directories exist
    [ -d "$BACKEND_DIR" ] || fail "Backend directory not found at $BACKEND_DIR"
    [ -d "$FRONTEND_DIR" ] || fail "Frontend directory not found at $FRONTEND_DIR"
    start_backend
    start_frontend
    info "Both servers are running. Press Ctrl+C to stop."
    wait
    ;;
esac
