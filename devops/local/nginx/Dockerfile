# Use the official Nginx image as the base image
FROM nginx:alpine

# WORKDIR /var/www/indrz
WORKDIR /usr/share/nginx/html

# Copy the NGINX configuration file to the container
COPY devops/local/nginx/conf.d/default-dev.conf /etc/nginx/conf.d/default.conf
