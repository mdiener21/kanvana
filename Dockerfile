FROM node:24-alpine AS builder

WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM nginx:alpine AS prod

COPY --from=builder /app/dist /usr/share/nginx/html
COPY devops/local/nginx/conf.d/default-prod.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
