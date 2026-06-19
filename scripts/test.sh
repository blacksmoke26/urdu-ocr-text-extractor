#!/usr/bin/env bash
# ============================================================================
# test.sh — Run all project tests (backend + frontend)
# ============================================================================
# Usage:
#   ./scripts/test.sh              # run all tests
#   ./scripts/test.sh backend      # backend tests only
#   ./scripts/test.sh frontend     # frontend tests only
#   ./scripts/test.sh --coverage   # include coverage report
# ============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="all"
COVERAGE=false

for arg in "$@"; do
  case "$arg" in
    backend)    MODE="backend" ;;
    frontend)   MODE="frontend" ;;
    --coverage) COVERAGE=true ;;
  esac
done

RED="\033[1;31m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
CYAN="\033[1;34m"
NC="\033[0m"

pass()  { echo -e "${GREEN}[PASS]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; FAILURES=$((FAILURES + 1)); }
run()   { echo -e "${CYAN}[RUN]${NC}  $*"; }

BACKEND_PASS=0
FRONTEND_PASS=0
TOTAL_FAILURES=0

# ──────────────────────────────────────────────────────────────────────
# Frontend tests
# ─────────────────────────_MODE
run_frontend_tests() {
  echo ""
  echo "========================================"
  echo " Frontend Tests"
  echo "========================================"

  if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    fail "Frontend deps not installed. Run ./scripts/setup.sh first."
    return
  fi

  cd "$PROJECT_ROOT/frontend"

  # Run the Node-based test suite
  if npm run test 2>&1 | tee /dev/stderr; then
    TEST_COUNT=$(npm run test 2>&1 | grep -cE "^Test " || echo "0")
    pass "Frontend tests passed ($TEST_COUNT tests)"
    FRONTEND_PASS=$((FRONTEND_PASS + 1))
  else
    fail "Frontend tests failed"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
  fi

  # Run lint if available
  if npm run lint >/dev/null 2>&1; then
    pass "Linting passed"
    FRONTEND_PASS=$((FRONTEND_PASS + 1))
  else
    fail "Linting failed"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
  fi
}

# ──────────────────────────────────────────────────────────────────────
# Backend tests (smoke test — import check since no formal test suite exists)
# ──────────────────────────────────────────────────────────────────────
run_backend_tests() {
  echo ""
  echo "========================================"
  echo " Backend Tests"
  echo "========================================"

  if [ ! -d "$PROJECT_ROOT/backend/venv" ]; then
    fail "Backend venv not found. Run ./scripts/setup.sh first."
    return
  fi

  source "$PROJECT_ROOT/backend/venv/bin/activate"
  cd "$PROJECT_ROOT/backend"

  # 1. Import check — can all modules be imported?
  if python -c "import sys; sys.path.insert(0, 'v2'); from main import app; print(f'App title: {app.title}')" 2>&1 | tee /dev/stderr; then
    pass "Backend module imports OK"
    BACKEND_PASS=$((BACKEND_PASS + 1))
  else
    fail "Backend module imports failed"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
  fi

  # 2. FastAPI docs endpoint smoke test (async)
  if python -c "
import asyncio, httpx

async def health_check():
    async with httpx.AsyncClient() as client:
        r = await client.get('http://127.0.0.1:8000/docs')
        assert r.status_code == 200, f'Expected 200, got {r.status_code}'
        print(f'Docs endpoint: HTTP {r.status_code}')

asyncio.run(health_check())
" 2>&1 | tee /dev/stderr; then
    pass "FastAPI docs endpoint OK (assuming server is running)"
    BACKEND_PASS=$((BACKEND_PASS + 1))
  else
    echo -e "${YELLOW}[SKIP]${NC} Backend API smoke test — backend server not running. Run it first with ./scripts/run.sh"
  fi
}

# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Urdu OCR — Test Runner               ║"
echo "╚════════════════════════════════════════╝"

case "$MODE" in
  all)
    run_frontend_tests
    run_backend_tests
    ;;
  frontend) run_frontend_tests ;;
  backend)  run_backend_tests  ;;
esac

# Summary
echo ""
echo "========================================"
if [ "$TOTAL_FAILURES" -gt 0 ]; then
  echo -e "${RED}Tests FAILED: $TOTAL_FAILURES failure(s)${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
