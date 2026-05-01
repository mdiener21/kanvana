# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json ./

RUN npm install

# ── Stage 2: Development ───────────────────────────────────────────────────────
FROM builder

EXPOSE 3000
ENV DOCKER=true

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000", "--no-open"]
