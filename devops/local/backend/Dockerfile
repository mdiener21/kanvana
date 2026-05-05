FROM adrianmusante/pocketbase:latest

COPY devops/local/backend/pb_migrations/ /pocketbase/migrations/

# Runs as uid 1001 (pocketbase user from base image).
# Creates data dir owned by 1001 so Docker volume init preserves correct ownership.
RUN mkdir -p /pocketbase/data
