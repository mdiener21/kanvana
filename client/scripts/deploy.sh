#!/usr/bin/env bash
set -Eeuo pipefail

cd "$APP_DIR"

echo "==> Current running image"
OLD_IMAGE_ID="$(docker inspect --format='{{.Image}}' "$SERVICE_NAME" 2>/dev/null || true)"
echo "Old image ID: ${OLD_IMAGE_ID:-none}"

echo "==> Pulling new image"
docker compose -f "$COMPOSE_FILE" pull "$SERVICE_NAME"

echo "==> Starting updated container"
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME"

echo "==> Waiting for health check"
for i in {1..30}; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "Health check OK"
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi

  echo "Health check failed, retry $i/30"
  sleep 2
done

echo "ERROR: Health check failed after deployment"
echo "Recent logs:"
docker compose -f "$COMPOSE_FILE" logs --tail=100 "$SERVICE_NAME"

echo "Manual rollback may be required."
exit 1