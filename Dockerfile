# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — Backend (Python)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS backend-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OCR_DEVICE=cpu \
    OCR_HOST=0.0.0.0 \
    OCR_PORT=8000

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY backend/ ./

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — Frontend (Node build → nginx serve)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev

COPY frontend/ ./
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3 — Final image (Docker multi-stage: backend only; frontend served by nginx)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS final

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OCR_DEVICE=cpu \
    OCR_HOST=0.0.0.0 \
    OCR_PORT=8000

# nginx for frontend + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend
COPY --from=backend-base /app/backend/ ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend (built)
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# nginx config
RUN cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Docs / Redoc (backend)
    location /docs {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
    location /redoc {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }
}
NGINX

EXPOSE 80

CMD ["sh", "-c", "nginx -g 'daemon off;' & cd /app/backend && exec uvicorn v2.main:app --host 0.0.0.0 --port 8000 --workers 1"]
