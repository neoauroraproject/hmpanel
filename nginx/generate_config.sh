#!/bin/sh
# This script enforces EXACTLY ONE source of truth for Nginx configuration generation.
# It MUST be run inside the hmpanel-nginx container.

SSL_CERT="/etc/nginx/ssl/fullchain.pem"
SSL_KEY="/etc/nginx/ssl/privkey.pem"
SSL_DISABLED="/etc/nginx/ssl/.ssl_disabled"

# Host port published for HTTPS (docker maps it to 443 here). Redirects must
# carry it, or a panel moved off 443 sends browsers to a dead port.
PUBLIC_HTTPS_PORT="${PUBLIC_HTTPS_PORT:-443}"
if [ "$PUBLIC_HTTPS_PORT" = "443" ]; then
  HTTPS_PORT_SUFFIX=""
else
  HTTPS_PORT_SUFFIX=":${PUBLIC_HTTPS_PORT}"
fi
export HTTPS_PORT_SUFFIX

VARS='$APP_PORT $BACKEND_PORT $PANEL_DOMAIN $HTTPS_PORT_SUFFIX'

if [ -f "$SSL_DISABLED" ]; then
  echo '[Nginx] HTTPS disabled by operator (.ssl_disabled). Generating HTTP-only config...';
  envsubst "$VARS" < /etc/nginx/nginx.conf.http.template > /etc/nginx/nginx.conf;
elif [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ] && openssl x509 -checkend 0 -noout -in "$SSL_CERT" >/dev/null 2>&1; then
  echo '[Nginx] Valid SSL certificates found. Generating HTTPS config...';
  envsubst "$VARS" < /etc/nginx/nginx.conf.ssl.template > /etc/nginx/nginx.conf;
else
  echo '[Nginx] SSL certificates missing or invalid. Generating HTTP-only config...';
  envsubst "$VARS" < /etc/nginx/nginx.conf.http.template > /etc/nginx/nginx.conf;
fi
