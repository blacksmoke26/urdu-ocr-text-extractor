# Quick Start Guide — Urdu OCR Web App

## Prerequisites

| Requirement    | Minimum Version | How to check              |
|---------------|-----------------|---------------------------|
| Python        | 3.10+           | `python3 --version`       |
| Node.js       | 18+             | `node --version`          |
| npm           | 9+              | `npm --version`           |
| Docker (opt.) | 24+             | `docker --version`        |
| Git (opt.)    | —               | `git --version`           |

---

## Option A — Local Development (fastest)

### 1. One-command setup and start

```bash
# Windows (PowerShell or CMD):
.\scripts\setup.sh && .\scripts\run.sh

# Linux / macOS / Git Bash:
./scripts/setup.sh && ./scripts/run.sh
```

This will:

- Create a Python virtualenv (`backend/venv/`) and install all deps
- Install frontend npm dependencies
- Generate `.env` files in both `backend/` and `frontend/`
- Start **backend** on `http://localhost:8000`
- Start **frontend** on `http://localhost:5173`

### 2. Manual step-by-step

```bash
# --- Backend ---
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # edit if needed
./start-server.sh                 # → http://localhost:8000

# --- Frontend (new terminal) ---
cd frontend
npm install
cp .env.example .env              # edit if needed
npm run dev                       # → http://localhost:5173
```

### 3. Running just one service

```bash
./scripts/run.sh backend    # backend only
./scripts/run.sh frontend   # frontend only
```

---

## Option B — Docker (production / reproducible)

```bash
# Copy and edit env vars
cp .env.example .env          # root-level .env for docker-compose

# Build and start
./scripts/deploy.sh           # build + up in one command

# Or step by step:
./scripts/deploy.sh --build   # build only
./scripts/deploy.sh            # start containers

# View logs
./scripts/deploy.sh --logs

# Tear down
./scripts/deploy.sh --down
```

**Docker endpoints:**

| Service       | URL                       |
|--------------|---------------------------|
| Frontend     | `http://localhost`        |
| Backend API  | `http://localhost:8000`   |
| Swagger docs | `http://localhost:8000/docs` |
| ReDoc        | `http://localhost:8000/redoc` |

---

## Option C — Testing

```bash
./scripts/test.sh              # run all tests
./scripts/test.sh frontend     # frontend only
./scripts/test.sh backend      # backend only
./scripts/test.sh --coverage   # with coverage report
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable               | Default      | Description                     |
|------------------------|--------------|---------------------------------|
| `OCR_HOST`             | `localhost`  | Bind address                    |
| `OCR_PORT`             | `8000`       | Server port                     |
| `OCR_DEVICE`           | `auto`       | `cpu` / `cuda` / `auto`        |
| `OCR_API_KEYS`         | *(empty)*    | Comma-separated API keys        |
| `OCR_CACHE_ENABLED`    | `true`       | Enable result caching           |
| `OCR_RATE_LIMIT_ENABLED` | `true`     | Enable rate limiting            |

See `backend/.env.example` for the full list.

### Frontend (`frontend/.env`)

| Variable             | Default        | Description                |
|----------------------|----------------|----------------------------|
| `VITE_API_WS_HOST`   | `localhost:8000` | Backend API host for proxy |

### Docker Compose (root `.env`)

All backend env vars can also be set at the root level — they are passed through to containers.

---

## File Reference

```
End-To-End-Urdu-OCR-WebApp/
├── scripts/
│   ├── run.sh         # Start both / single servers concurrently
│   ├── setup.sh       # Install deps + init .env files
│   ├── test.sh        # Run all tests
│   └── deploy.sh      # Docker production deploy
├── docker-compose.yml # Compose file for dev & prod
├── Dockerfile         # Multi-stage Docker build
├── .dockerignore      # Exclude noisy files from Docker context
├── .env.example       # Root-level env for docker-compose
├── backend/
│   ├── .env.example   → .env
│   ├── requirements.txt
│   └── start-server.sh
├── frontend/
│   ├── .env.example   → .env
│   └── package.json
└── QUICKSTART.md      ← you are here
```

---

## Troubleshooting

| Problem                         | Solution                                |
|---------------------------------|-----------------------------------------|
| Port 8000 in use                | Set `OCR_PORT=8001` in `backend/.env`   |
| Port 5173 in use                | Set `VITE_PORT=5174` in `frontend/.env` |
| PyTorch install fails           | Use CUDA wheel: see setup.sh output      |
| Docker build too slow on Windows| Enable WSL2 backend in Docker Desktop    |
| CORS errors in browser          | Check `OCR_CORS_ORIGINS` in backend/.env |
