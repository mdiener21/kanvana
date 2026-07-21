FROM adrianmusante/pocketbase:latest

COPY backend/pb_migrations/ /pocketbase/migrations/
COPY backend/pb_hooks/ /pocketbase/hooks/

RUN mkdir -p /pocketbase/data
