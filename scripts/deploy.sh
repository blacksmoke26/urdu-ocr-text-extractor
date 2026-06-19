#!/usr/bin/env bash
# ============================================================================
# deploy.sh — Production deployment script
# ============================================================================
# Usage:
#   ./scripts/deploy.sh              # full production deploy
#   ./scripts/deploy.sh --build      # build Docker images only
#   ./scripts/deploy.sh --down       # tear down containers
#   ./scripts/deploy.sh --logs       # tail logs
# ============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ACTION="full"

for arg in "$@"; do
  case "$arg" in
    --build)  ACTION="build" ;;
    --down)   ACTION="down" ;;
    --logs)   ACTION="logs" ;;
    *)        ;;
  esac
done

info() { echo -e "\033[1;34m[INFO] \033[0m$*"; }
ok()   { echo -e "\033[1;32m[OK]   \033[0m$*" ; }
fail() { echo -e "\033[1;31m[FAIL] \033[0m$*" >&2; exit 1; }

# ─── Pre-flight checks ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install it first: https://docs.docker.com/get-docker/"
command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1 && COMPOSE_CMD="docker compose" || fail "Docker Compose not found."

COMPOSE_CMD=${COMPOSE_CMD:-docker compose}
COMPOSE="$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml"

# ─── .env setup ─────────────────────────────────────────────────────
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  info "Creating .env from .env.example..."
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
fi

case "$ACTION" in
  build)
    info "Building Docker images..."
    $COMPOSE build
    ok "Images built. Run ./scripts/deploy.sh to start."
    ;;

  down)
    info "Stopping and removing containers..."
    $COMPOSE down --remove-orphans
    ok "Containers stopped."
    ;;

  logs)
    info "Tailing logs (Ctrl+C to stop)..."
    $COMPOSE logs -f
    ;;

  full|*)
    # Build + up
    info "Building Docker images..."
    $COMPOSE build

    info "Starting production stack..."
    $COMPOSE up -d

    ok "Stack is running!"
    echo ""
    echo "  Frontend: http://localhost"
    echo "  Backend API docs: http://localhost:8000/docs"
    echo "  Backend Redoc:    http://localhost:8000/redoc"
    echo ""
    info "Run ./scripts/deploy.sh --logs to view logs."
    ;;
esac
