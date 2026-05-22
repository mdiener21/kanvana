# Docker & DevOps Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Containerized developer setup + VPS production deployment + CI/CD pipeline updates

---

## Overview

Kanvana is a static frontend (Vite build output) paired with an optional PocketBase backend. This
design wraps both into a single Docker Compose stack so developers can spin up the full environment
in one command, and self-hosters can deploy to any VPS with the same compose file.

The frontend has no server at runtime — all pages are pre-built static HTML/JS/CSS served by nginx.
PocketBase is never exposed directly; all external traffic routes through nginx.

### Goals

- One-command local environment: `npm run build && docker compose up`
- Identical compose topology used in development and production (no separate prod file checked in)
- Zero direct exposure of PocketBase; nginx proxies `/api/` and `/_/` internally
- Multi-arch Docker images (amd64 + arm64) built and pushed to GHCR on every push to `main`
- SSH-based VPS deployment triggered automatically after a successful image build
- FTP deploy to `kanvana.com` continues unchanged alongside the new Docker deploy path
- Node version standardized to 20 across all CI workflows

### Non-Goals

- TLS termination inside Docker (handled by external reverse proxy on VPS)
- Kubernetes / orchestration beyond Docker Compose
- Multi-container horizontal scaling
- Automated PocketBase schema migrations in CI (schema is managed via PocketBase admin UI)

---

## Repository File Layout

Files added or modified by this design:

```
docker-compose.yml                   ← main compose file with the local dev frontend workflow
.env.example                         ← documented environment variables
.dockerignore                        ← keep image lean
Dockerfile                           ← multi-stage: builder → prod
devops/nginx/
  nginx.conf                         ← worker/event config
  conf.d/
    default.conf                     ← static files + /api/ and /_/ proxy rules
.github/workflows/
  ci.yml                               ← NEW: docker-build job + ftp-deploy job (replaces deploy.yml)
  deploy-docker.yml                    ← NEW: SSH VPS deploy (triggered by ci.yml via workflow_run)
.github/workflows/deploy.yml           ← DELETED: replaced by ci.yml
.github/workflows/release.yml          ← verify Node 20 (already 20)
.github/workflows/publish-release.yml  ← verify/set Node 20
```

---

## Services

Three Docker Compose services. PocketBase is intentionally not port-mapped to the host.

| Service      | Image                          | Exposed port (host) | Internal port | Notes                        |
|--------------|--------------------------------|---------------------|---------------|------------------------------|
| `nginx`      | `nginx:alpine`                 | `${NGINX_PORT:-80}` | 80            | Serves static files + proxy  |
| `pocketbase` | `ghcr.io/<owner>/kanvana:…`    | none                | 8090          | Internal only; data on volume|

> **Why no `app` service?** The frontend is pure static — it has no runtime server. The Vite build
> output (`dist/`) is baked into the `nginx` image at build time. There is no Node.js process in
> production.

---

## Dockerfile

Multi-stage build. Stage 1 (`builder`) runs `npm ci && npm run build`. Stage 2 (`prod`) copies
`dist/` into an `nginx:alpine` image. No Node.js in the final image.

```dockerfile
# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production nginx ──────────────────────────────────────────────────
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Build target selection:**
- `docker compose build` uses the `prod` target (default `AS prod` = last stage)
- The `builder` stage is reused by CI layer caching

---

## `docker-compose.yml`

Main compose file. Committed to the repository. It now carries the frontend dev-mode settings
directly instead of relying on a separate override file.

```yaml
services:
  nginx:
    build:
      context: .
      target: dev
    command: npm run dev -- --host 0.0.0.0 --port 80 --open false
    working_dir: /app
    image: ghcr.io/<owner>/kanvana:${IMAGE_TAG:-latest}
    ports:
      - "${NGINX_PORT:-8080}:80"
    volumes:
      - ./client:/app
      - frontend_node_modules:/app/node_modules
    depends_on:
      - pocketbase
    restart: unless-stopped

  pocketbase:
    image: ghcr.io/<owner>/kanvana-pb:${PB_VERSION:-latest}
    # PocketBase official image or custom — no host port mapping
    expose:
      - "8090"
    volumes:
      - pb_data:/pb/pb_data
    restart: unless-stopped

volumes:
  pb_data:
  frontend_node_modules:
```

> **PocketBase image:** Use `spectado/pocketbase` (Docker Hub, publicly accessible, port 80). The
> previously noted `ghcr.io/muchobig/pocketbase` image requires authentication and is not publicly
> accessible. Pin via `PB_VERSION` tag (e.g. `0.22.0`). The Kanvana repo does not build a custom
> PocketBase image. Note: `spectado/pocketbase` exposes port **80** (not 8090) — all nginx proxy
> targets must use `http://pocketbase:80`.

---

> **Note:** In local Docker development the main compose file runs the Dockerfile's `dev` target
> and serves Vite against the bind-mounted `client/` package. The host uses port 8080 by
> default via `NGINX_PORT`, while the container listens on port 80.

---

## Nginx Configuration

### `nginx/nginx.conf`

Minimal global config:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    server_tokens off;   # hide nginx version
    include /etc/nginx/conf.d/*.conf;
}
```

### `nginx/conf.d/default.conf`

Static file serving + PocketBase proxy + security headers:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # ── Security headers ──────────────────────────────────────────────────────
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── PocketBase API proxy ──────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://pocketbase:8090/api/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
    }

    # ── PocketBase admin UI proxy (restrict in production) ────────────────────
    # WARNING: Restrict this location to trusted IPs in production.
    # Uncomment and configure the allow/deny block before exposing to the internet.
    location /_/ {
        # allow 1.2.3.4;  # your admin IP
        # deny all;
        proxy_pass         http://pocketbase:8090/_/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Static files (SPA fallback) ───────────────────────────────────────────
    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    # ── Cache static assets ───────────────────────────────────────────────────
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Key routing decisions:**
- `/api/` → `pocketbase:8090/api/` — all PocketBase collection and auth calls
- `/_/` → `pocketbase:8090/_/` — PocketBase admin UI (must be IP-restricted in production)
- `/` → static files from `dist/` baked into image; SPA-style `try_files` fallback

**CSP implication:** Because nginx proxies PocketBase at the same origin, `connect-src 'self'`
in the HTML CSP meta tag covers all PocketBase API calls in production — no dynamic origin
injection needed. The existing `'self'`-only CSP in all three HTML files is sufficient when the
Docker stack is in use.

---

## Environment Variables

Documented in `.env.example` (committed). Actual values in `.env` (gitignored).

```dotenv
# .env.example

# Port nginx listens on (host side). Defaults: 8080 in dev (override), 80 in prod.
NGINX_PORT=80

# PocketBase version tag for the PocketBase image.
PB_VERSION=0.22.0

# Docker image tag for the nginx/frontend image.
# CI sets this to the git SHA; leave as 'latest' for local use.
IMAGE_TAG=latest
```

`.env` is gitignored. The VPS populates environment via a `.env` file created during initial
server setup or via the deployment workflow's SSH commands.

---

## `.dockerignore`

Keeps the build context small and avoids leaking secrets into the image:

```
node_modules
dist
.git
.env
.env.*
!.env.example
tests
docs
*.md
.github
```

---

## CI/CD Workflows

### New: `docker-build.yml` — Build + Push to GHCR

Triggers on every push to `main`. Builds a multi-arch image (amd64 + arm64) and pushes two tags:
- `latest`
- `sha-<short-sha>` (e.g. `sha-a1b2c3d`)

```yaml
name: Docker Build and Push

on:
  push:
    branches: [main]

jobs:
  docker-build:
    name: Build and push Docker image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: npm audit gate
        run: npm ci && npm audit --audit-level=high

      - name: Set up QEMU (multi-arch)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          target: prod
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/kanvana:latest
            ghcr.io/${{ github.repository_owner }}/kanvana:sha-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**`npm audit` gate:** The build fails (and no image is pushed) if `npm audit` reports any
high or critical vulnerabilities. This is the primary supply-chain security gate.

### New: `deploy-docker.yml` — SSH Deploy to VPS

Runs after `docker-build` succeeds. SSHes into the VPS and runs `docker compose pull && up -d`.

```yaml
name: Deploy Docker to VPS

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: Deploy to VPS
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/kanvana
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

**Required secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`

**VPS directory assumption:** The compose stack lives at `/opt/kanvana/` on the VPS. The VPS
operator must place `docker-compose.yml` (no override) and a `.env` file there during initial
setup. The deployment workflow only pulls the new image and restarts containers — it does not
modify the compose or env files.

### Modified: `deploy.yml` → replaced by `ci.yml`

The existing `deploy.yml` (FTP deploy to `kanvana.com`) is merged with the new Docker build into
a single workflow file `ci.yml`. This eliminates the need for cross-workflow `workflow_run`
triggers between the build and FTP deploy. The old `deploy.yml` is deleted.

**`ci.yml` job structure:**

```
jobs:
  docker-build    ← npm audit + multi-arch Docker build + GHCR push
  ftp-deploy      ← needs: [docker-build]; FTP mirror of dist/ to kanvana.com
```

Both jobs run on every push to `main`. The FTP deploy only runs if the Docker build (including
`npm audit`) succeeds.

**`deploy-docker.yml`** (separate file) continues to use `workflow_run` on the workflow named
`"CI"` (the new `ci.yml` workflow's `name:` field) to trigger VPS deployment after `ci.yml`
completes successfully.

**`docker-build.yml`** is not created as a standalone file — it is the `docker-build` job inside
`ci.yml`.

### Modified: `release.yml` + `publish-release.yml` — Node version

`release.yml` already uses Node 20. `publish-release.yml` must be verified and updated to
Node 20 if needed. The existing `deploy.yml` Node 24 is eliminated when that file is replaced
by `ci.yml` (which uses Node 20). Standardize all CI Node usage to `node-version: 24`.
`copilot-setup-steps.yml` uses `lts/*` — leave it (Copilot-specific, not part of main CI).

---

## Developer Workflow

### First-time setup

```bash
git clone <repo>
cd kanvana
npm install
npm run build          # produce dist/
docker compose up      # starts nginx (port 8080) + pocketbase
# Open http://localhost:8080
```

The single `docker-compose.yml` bind-mounts `client/` into the frontend container and starts
Vite in dev mode.

### Day-to-day development

Vite dev server (`npm run dev`) remains the primary DX tool for fast iteration with hot-reload.
Docker is used when you need to test the full stack (nginx routing, PocketBase connectivity,
CSP headers).

```bash
cd client
npm run dev            # Vite hot-reload at http://localhost:3000 (no Docker needed)
# --- or, to test the full Docker stack: ---
docker compose up      # Vite dev server + PocketBase at http://localhost:8080
```

### Connecting to PocketBase in dev (Docker mode)

When running the Docker stack locally, the PocketBase URL is `http://localhost:8080/api` (same
origin, routed through nginx). The `validatePbUrl()` function in `pb-auth.js` normally rejects
non-HTTPS and non-localhost URLs. In dev mode, `import.meta.env.DEV` (Vite's built-in flag,
`true` during `npm run dev`) is used to relax the localhost restriction — but when running the
full Docker stack the static build does not have HMR, and `import.meta.env.DEV` will be `false`
(production build). Self-hosters connecting to `http://localhost:8080` via the Docker stack
should use HTTPS (`https://localhost` with a self-signed cert) or configure their URL validation
accordingly.

> **Clarification for the PocketBase spec:** The `import.meta.env.DEV` dev-mode exemption in
> `validatePbUrl()` applies when running `npm run dev` (Vite dev server) pointing at a local
> PocketBase instance. When using the Docker stack (production build), the standard URL
> validation applies. Self-hosters accessing PocketBase through the Docker nginx proxy use
> `http://localhost` (same-origin, no URL needed in the connect form — the app already talks to
> `/api/` at the same origin).

---

## Security

### PocketBase isolation

PocketBase is never port-mapped to the host. The only way to reach it is through nginx on port
80. The `/api/` proxy forwards only the PocketBase REST and auth APIs. The `/_/` admin UI proxy
includes a warning comment instructing self-hosters to restrict it to trusted IPs before
production use.

### Image supply chain

- `npm audit` runs as a CI gate before any image is built or pushed. High/critical findings fail
  the build.
- Base images (`node:20-alpine`, `nginx:alpine`) are pinned to named tags (not `latest` floating
  tags) for reproducibility. Consider pinning to digest in the future.
- GHCR images are scoped to the repository owner. `GITHUB_TOKEN` is used for authentication
  (no long-lived personal access tokens).

### Secrets

| Secret          | Used in           | Purpose                        |
|-----------------|-------------------|--------------------------------|
| `GITHUB_TOKEN`  | `docker-build.yml`| Push to GHCR (auto-provided)   |
| `FTP_USER`      | `deploy.yml`      | Existing FTP deploy            |
| `FTP_PASSWORD`  | `deploy.yml`      | Existing FTP deploy            |
| `VPS_HOST`      | `deploy-docker.yml`| SSH target hostname            |
| `VPS_USER`      | `deploy-docker.yml`| SSH username                   |
| `VPS_SSH_KEY`   | `deploy-docker.yml`| SSH private key                |

No secrets are baked into images. No `.env` files are committed.

---

## Data Persistence

PocketBase data lives in a Docker named volume `pb_data`. This volume persists across container
restarts and image updates (`docker compose pull && up -d` does not delete it).

**Backup responsibility:** Named volumes are not automatically backed up. Self-hosters must
implement their own backup strategy (e.g. `docker run --rm -v pb_data:/data -v $(pwd):/backup
alpine tar czf /backup/pb_data.tar.gz /data`).

In development, the `docker-compose.yml` setup could optionally use a bind-mount to
`./data/pb_data` instead of a named volume for easier inspection. This is left as an optional
local customization, not the default, since `/data` is already in `.gitignore`.

---

## VPS Initial Setup (Operator Runbook)

One-time steps for a new VPS:

1. Install Docker + Docker Compose plugin
2. `mkdir -p /opt/kanvana && cd /opt/kanvana`
3. Copy `docker-compose.yml` from the repository
4. Create `.env` with production values (at minimum: `NGINX_PORT=80`, `PB_VERSION=<tag>`)
5. Set up an external reverse proxy (e.g. Caddy or nginx outside Docker) for TLS termination,
   pointing to `localhost:80`
6. `docker compose pull && docker compose up -d`
7. Open the PocketBase admin UI at `https://<your-domain>/_/` to create the first admin account
8. Restrict `/_/` in `nginx/conf.d/default.conf` to trusted IPs (or via the external proxy)

After initial setup, all subsequent deploys are handled automatically by `deploy-docker.yml`.

---

## Impact on PocketBase Spec

This Docker design has two specific impacts on the PocketBase backend spec
(`docs/superpowers/specs/2026-04-04-pocketbase-backend-design.md`):

### 1. `validatePbUrl()` dev-mode exemption

The URL validation in `pb-auth.js` must allow `http:` and `localhost` URLs when
`import.meta.env.DEV === true` (Vite dev server mode). This enables developers to connect to
a local PocketBase instance during `npm run dev` without setting up HTTPS.

The exemption is scoped strictly to dev mode. In production builds (`import.meta.env.DEV ===
false`), the full validation applies.

Update to the spec's PocketBase URL Validation section:

> **Dev-mode exemption:** When `import.meta.env.DEV === true`, the `https:` protocol
> requirement and loopback hostname restriction are relaxed. This allows connecting to
> `http://localhost:8090` during local development. This flag is `false` in all production
> builds — the exemption never applies in production.

### 2. CSP `connect-src` in Docker production

When Kanvana is served via the Docker nginx stack, PocketBase is proxied at the same origin.
The existing `connect-src 'self'` in all three HTML files is sufficient — no dynamic
`<pocketbase-origin>` needs to be appended. The CSP `connect-src` dynamic update described in
the PocketBase spec's Security section applies only to non-Docker self-hosted deployments where
PocketBase is on a different origin.

No code change is required for this. The existing CSP is already correct for Docker deployments.

---

## Dependencies

- `docker` + `docker compose` plugin (v2) — not an npm dependency; operator-installed
- `nginx:alpine` — base image for the `prod` stage
- `node:20-alpine` — base image for the `builder` stage
- PocketBase Docker image (community image, pinned via `PB_VERSION`)
- GitHub Actions: `docker/setup-qemu-action`, `docker/setup-buildx-action`,
  `docker/login-action`, `docker/build-push-action`, `appleboy/ssh-action`

---

## Testing Strategy

Docker infrastructure does not require unit tests. Verification is done at the integration and
manual level:

- **Local smoke test (manual):** `npm run build && docker compose up` → `curl
  http://localhost:8080` returns HTML; `curl http://localhost:8080/api/health` returns
  PocketBase health JSON; PocketBase is not reachable on any host port directly
- **CI gate:** `npm audit` in `docker-build.yml` ensures no high/critical vulnerabilities before
  any image push
- **E2E (optional, deferred):** Playwright tests can be configured to run against the Docker
  stack by pointing `baseURL` at `http://localhost:8080`; this is out of scope for the initial
  implementation

---

## File Change Summary

| File | Action | Notes |
|------|--------|-------|
| `Dockerfile` | Create | Multi-stage builder + prod |
| `docker-compose.yml` | Create | Main compose (nginx + pocketbase) |
| `.env.example` | Create | Documented env vars |
| `.dockerignore` | Create | Lean build context |
| `nginx/nginx.conf` | Create | Worker/event config |
| `nginx/conf.d/default.conf` | Create | Static + proxy routing + security headers |
| `.github/workflows/ci.yml` | Create | Docker build job + FTP deploy job (replaces deploy.yml) |
| `.github/workflows/deploy-docker.yml` | Create | SSH VPS deploy (triggered by ci.yml) |
| `.github/workflows/deploy.yml` | Delete | Replaced by ci.yml |
| `.github/workflows/publish-release.yml` | Modify | Verify/set Node 20 |
| `src/modules/pb-auth.js` | Modify | `import.meta.env.DEV` dev-mode exemption in `validatePbUrl()` |
| `docs/superpowers/specs/2026-04-04-pocketbase-backend-design.md` | Modify | Docker context notes |
| `docs/superpowers/plans/2026-04-04-pocketbase-backend.md` | Modify | Task 3 + Task 12 updates |
