# Docker & DevOps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Docker Compose stack (nginx + PocketBase) for one-command local development and VPS production deployment, and update CI/CD to build/push multi-arch images to GHCR and deploy via SSH.

**Architecture:** Nginx serves the Vite-built static frontend and proxies `/api/` and `/_/` to PocketBase internally (PocketBase is never port-exposed to the host). A multi-stage Dockerfile bakes `dist/` into an `nginx:alpine` image. A `docker-compose.override.yml` auto-loads in dev with a bind-mount of `dist/` and port 8080. CI uses a single `ci.yml` workflow (docker-build job + ftp-deploy job); a separate `deploy-docker.yml` SSHes into the VPS after `ci.yml` succeeds.

**Tech Stack:** Docker, Docker Compose v2, nginx:alpine, node:20-alpine, GitHub Actions (docker/build-push-action, appleboy/ssh-action), GHCR.

**Spec:** `docs/superpowers/specs/2026-04-04-docker-devops-design.md`

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| **Create** | `Dockerfile` | Multi-stage: `builder` (node:20-alpine, npm ci + build) → `prod` (nginx:alpine, copy dist/) |
| **Create** | `docker-compose.yml` | Main compose: nginx + pocketbase services, pb_data named volume |
| **Create** | `docker-compose.override.yml` | Dev overrides: dist/ bind-mount, port 8080 |
| **Create** | `.env.example` | Documented env vars: NGINX_PORT, PB_VERSION, IMAGE_TAG |
| **Create** | `.dockerignore` | Exclude node_modules, dist, .git, .env, tests, docs from build context |
| **Create** | `nginx/nginx.conf` | Worker/event/http global config |
| **Create** | `nginx/conf.d/default.conf` | Static file serving + /api/ and /_/ proxy rules + security headers |
| **Create** | `.github/workflows/ci.yml` | docker-build job (npm audit + multi-arch image + GHCR push) + ftp-deploy job |
| **Create** | `.github/workflows/deploy-docker.yml` | SSH VPS deploy triggered by ci.yml |
| **Delete** | `.github/workflows/deploy.yml` | Replaced by ci.yml |

---

## Task 1: Create `.dockerignore`

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

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

- [ ] **Step 2: Verify the file exists**

```bash
cat .dockerignore
# Expected: the contents above
```

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

## Task 2: Create `nginx/nginx.conf` and `nginx/conf.d/default.conf`

**Files:**
- Create: `nginx/nginx.conf`
- Create: `nginx/conf.d/default.conf`

- [ ] **Step 1: Create the `nginx/` directory structure**

```bash
mkdir -p nginx/conf.d
```

- [ ] **Step 2: Create `nginx/nginx.conf`**

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
    server_tokens off;
    include /etc/nginx/conf.d/*.conf;
}
```

- [ ] **Step 3: Create `nginx/conf.d/default.conf`**

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

- [ ] **Step 4: Commit**

```bash
git add nginx/
git commit -m "chore: add nginx config (global + default vhost with PocketBase proxy)"
```

---

## Task 3: Create `Dockerfile`

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create `Dockerfile`**

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

- [ ] **Step 2: Verify the image builds locally**

```bash
docker build --target prod -t kanvana:local .
# Expected: Successfully tagged kanvana:local
```

- [ ] **Step 3: Verify the built image serves the app**

```bash
docker run --rm -p 9999:80 kanvana:local &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:9999
# Expected: 200
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile (builder + prod nginx)"
```

---

## Task 4: Create `docker-compose.yml` and `docker-compose.override.yml`

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`

Check what GitHub org/username is used in this repo before writing the image name:

```bash
git remote get-url origin
# Note the owner name for use in ghcr.io/<owner>/kanvana below
```

- [ ] **Step 1: Create `docker-compose.yml`**

Replace `<owner>` with the actual GitHub username/org from the git remote output above.

```yaml
services:
  nginx:
    build:
      context: .
      target: prod
    image: ghcr.io/<owner>/kanvana:${IMAGE_TAG:-latest}
    ports:
      - "${NGINX_PORT:-80}:80"
    depends_on:
      - pocketbase
    restart: unless-stopped

  pocketbase:
    image: ghcr.io/muchobig/pocketbase:${PB_VERSION:-0.22.0}
    expose:
      - "8090"
    volumes:
      - pb_data:/pb/pb_data
    restart: unless-stopped

volumes:
  pb_data:
```

- [ ] **Step 2: Create `docker-compose.override.yml`**

```yaml
# docker-compose.override.yml — dev convenience overrides (auto-loaded locally)
# DO NOT copy to VPS — the VPS uses docker-compose.yml only.
services:
  nginx:
    volumes:
      # Live bind-mount: rebuild with `npm run build`, no image rebuild needed
      - ./dist:/usr/share/nginx/html:ro
    ports:
      - "${NGINX_PORT:-8080}:80"
```

- [ ] **Step 3: Verify the override is auto-loaded**

```bash
docker compose config | grep -A5 "ports:"
# Expected: port mapping shows 8080:80 (from override, not 80:80 from base)
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.override.yml
git commit -m "feat: add docker-compose.yml and dev override"
```

---

## Task 5: Create `.env.example`

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

```dotenv
# .env.example — copy to .env and fill in values
# .env is gitignored; .env.example is committed.

# Port nginx listens on (host side).
# Default in dev (override): 8080
# Default in prod (no override): 80
NGINX_PORT=80

# PocketBase image version tag.
PB_VERSION=0.22.0

# Docker image tag for the nginx/frontend image.
# CI sets this to the git SHA; leave as 'latest' for local builds.
IMAGE_TAG=latest
```

- [ ] **Step 2: Verify `.env` is gitignored but `.env.example` is not**

```bash
git check-ignore -v .env
# Expected: .gitignore:... .env  (ignored)
git check-ignore -v .env.example
# Expected: no output (not ignored)
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with documented environment variables"
```

---

## Task 6: Local Stack Smoke Test

Verify the complete local stack works before touching CI.

**Prerequisites:** Docker and Docker Compose v2 installed locally.

- [ ] **Step 1: Build the Vite output**

```bash
npm run build
# Expected: dist/ directory created with index.html, reports.html, calendar.html
ls dist/
```

- [ ] **Step 2: Start the stack**

```bash
docker compose up --build -d
# Expected: containers for nginx and pocketbase start
docker compose ps
# Expected: both services show "running"
```

- [ ] **Step 3: Verify nginx serves the app**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
# Expected: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/reports.html
# Expected: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/calendar.html
# Expected: 200
```

- [ ] **Step 4: Verify PocketBase is proxied and reachable**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health
# Expected: 200
```

- [ ] **Step 5: Verify PocketBase is NOT directly reachable on the host**

```bash
curl -s --connect-timeout 2 http://localhost:8090 || echo "BLOCKED (expected)"
# Expected: connection refused or "BLOCKED (expected)"
```

- [ ] **Step 6: Verify security headers are present**

```bash
curl -sI http://localhost:8080 | grep -i "x-frame-options\|x-content-type\|referrer"
# Expected:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 7: Tear down**

```bash
docker compose down
```

- [ ] **Step 8: Commit (no file changes — just confirming smoke test passed)**

```bash
git commit --allow-empty -m "chore: local Docker stack smoke test passed"
```

---

## Task 7: Create `ci.yml` — Docker Build + FTP Deploy

This replaces `.github/workflows/deploy.yml`. The new file has two jobs: `docker-build` runs
`npm audit` and builds + pushes a multi-arch image to GHCR; `ftp-deploy` runs after it and
mirrors `dist/` to `kanvana.com` via lftp.

**Files:**
- Create: `.github/workflows/ci.yml`
- Delete: `.github/workflows/deploy.yml`

- [ ] **Step 1: Read the current `deploy.yml` to copy the FTP deploy step exactly**

```bash
cat .github/workflows/deploy.yml
# Note the exact lftp command, env vars (FTP_USER, FTP_PASSWORD), and node version
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

Replace `<owner>` with the actual GitHub username/org.

```yaml
name: CI

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
          node-version: 20
          cache: npm

      - name: Install dependencies and run npm audit
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

  ftp-deploy:
    name: Deploy to kanvana.com via FTP
    runs-on: ubuntu-latest
    needs: [docker-build]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Install lftp
        run: sudo apt-get update && sudo apt-get install -y lftp ca-certificates

      - name: Deploy via lftp
        run: |
          lftp -c "
            set net:max-retries 3;
            set net:timeout 20;
            set ftp:passive-mode true;
            set ssl:verify-certificate false;
            set ftp:ssl-allow true;
            set ftp:ssl-force true;
            set ftp:ssl-protect-data yes;
            open -u ${FTP_USER},${FTP_PASSWORD} -p 21 kanvana.com;
            mirror --reverse --delete --verbose ./dist/ ./public_html/;
            bye;
          "
        env:
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASSWORD: ${{ secrets.FTP_PASSWORD }}
```

- [ ] **Step 3: Delete the old `deploy.yml`**

```bash
git rm .github/workflows/deploy.yml
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: replace deploy.yml with ci.yml (docker-build + ftp-deploy jobs)"
```

---

## Task 8: Create `deploy-docker.yml` — SSH VPS Deploy

Triggered after `ci.yml` completes successfully on `main`. SSHes into the VPS and runs
`docker compose pull && up -d`.

**Files:**
- Create: `.github/workflows/deploy-docker.yml`

- [ ] **Step 1: Create `.github/workflows/deploy-docker.yml`**

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

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-docker.yml
git commit -m "ci: add deploy-docker.yml — SSH VPS deploy triggered by CI workflow"
```

---

## Task 9: Verify CI Workflows Are Consistent (Node Version + Action Versions)

Ensure all CI workflows use Node 20 and consistent action versions.

**Files to check:**
- `.github/workflows/ci.yml` — just created, Node 20 ✓
- `.github/workflows/deploy-docker.yml` — no Node needed ✓
- `.github/workflows/release.yml` — check
- `.github/workflows/publish-release.yml` — check (Node 20 confirmed)
- `.github/workflows/static.yml` — check
- `.github/workflows/codeql.yml` — check
- `.github/workflows/spec-sync.yml` — check
- `.github/workflows/version-bump.yml` — check

- [ ] **Step 1: Check all workflow files for their Node version**

```bash
grep -n "node-version" .github/workflows/*.yml
# Note any that are NOT "20"
```

- [ ] **Step 2: Check the static.yml workflow for Node version**

```bash
cat .github/workflows/static.yml
```

- [ ] **Step 3: Update any workflow using a Node version other than 20**

For each file found in Step 1 that uses a non-20 version (e.g. `24`, `lts/*`, `18`), update it:

```bash
# Example: if static.yml uses node-version: 24
# Edit the file and change to node-version: 20
```

Skip `copilot-setup-steps.yml` — it uses `lts/*` intentionally for Copilot compatibility.

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

```bash
npm run test:unit && npm run test:dom
# Expected: all PASS
```

- [ ] **Step 5: Commit (only if changes were made)**

```bash
git add .github/workflows/
git commit -m "ci: standardize Node version to 20 across all workflows"
```

---

## Task 10: Update CHANGELOG and Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md` (update Repo Map if present, or note Docker commands)

- [ ] **Step 1: Add entries to `CHANGELOG.md` under `[Unreleased]`**

Add under `### Added`:

```markdown
### Added
- Docker Compose stack: nginx (static file server + PocketBase proxy) + PocketBase service
- `Dockerfile`: multi-stage build — `node:20-alpine` builder stage bakes Vite output into `nginx:alpine` prod image
- `docker-compose.yml`: main compose file for local and VPS deployment
- `docker-compose.override.yml`: dev convenience overrides (dist/ bind-mount, port 8080)
- `.env.example`: documented environment variables (NGINX_PORT, PB_VERSION, IMAGE_TAG)
- `nginx/nginx.conf` + `nginx/conf.d/default.conf`: nginx config with PocketBase proxy, security headers, static asset caching
- `.dockerignore`: lean build context
- CI `ci.yml`: replaces `deploy.yml`; adds Docker multi-arch build + GHCR push (npm audit gate) before FTP deploy
- CI `deploy-docker.yml`: SSH-based VPS deployment triggered after successful CI build
```

Add under `### Changed`:

```markdown
### Changed
- CI: replaced `deploy.yml` with `ci.yml` (docker-build + ftp-deploy jobs); FTP deploy now gated on Docker build success
- CI: standardized Node version to 20 across all workflows
```

- [ ] **Step 2: Update `AGENTS.md` — add Docker commands to the Commands section**

Find the `## Commands` section in `AGENTS.md` and add:

```markdown
docker compose up          # Start local Docker stack (nginx + PocketBase) at http://localhost:8080
docker compose up --build  # Rebuild image and start stack
docker compose down        # Stop and remove containers
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md AGENTS.md
git commit -m "docs: update CHANGELOG and AGENTS.md for Docker/DevOps additions"
```

---

## Self-Review Against Spec

**Spec section → Task mapping:**

| Spec section | Task |
|---|---|
| `.dockerignore` | Task 1 |
| `nginx/nginx.conf` + `nginx/conf.d/default.conf` | Task 2 |
| `Dockerfile` (multi-stage builder + prod) | Task 3 |
| `docker-compose.yml` (nginx + pocketbase + pb_data volume) | Task 4 |
| `docker-compose.override.yml` (dev bind-mount, port 8080) | Task 4 |
| `.env.example` | Task 5 |
| Local smoke test (nginx serves app, PB proxied, PB not host-exposed, security headers) | Task 6 |
| `ci.yml` (npm audit gate + multi-arch build + GHCR push + ftp-deploy) | Task 7 |
| `deploy-docker.yml` (SSH VPS deploy, workflow_run on "CI") | Task 8 |
| `deploy.yml` deleted | Task 7 |
| Node 20 standardization across all workflows | Task 9 |
| CHANGELOG + AGENTS.md docs | Task 10 |
| VPS initial setup runbook | Documented in spec; no code task required (operator-run steps) |
| Required GitHub secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY) | Documented in spec; no code task required (operator-configured) |
| `src/modules/pb-auth.js` dev-mode exemption | Covered in PocketBase plan Task 3 (already updated) |
| PocketBase spec + PB plan updated | Done in pre-plan commits |

**Placeholder scan:** No "TBD", "TODO", or vague steps found. All code blocks contain actual content.

**Type consistency:** No cross-task type/signature dependencies in this infrastructure plan.

**Gaps check:**
- The `<owner>` placeholder in `docker-compose.yml` and `ci.yml` is intentional — Task 4 and Task 7 explicitly instruct the implementer to resolve it from `git remote get-url origin`. Not a gap.
- GHCR image visibility (public vs private) is not configured in CI — the image inherits the repo visibility (public repos → public packages by default on GHCR). No action needed for the initial implementation; self-hosters can adjust in their GHCR settings.
