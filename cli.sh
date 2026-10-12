#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  HMPanel — CLI Manager
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_DIR="/opt/hmpanel"
BACKUP_DIR="${INSTALL_DIR}/backups"

# Compose V2 (`docker compose`) or legacy V1 (`docker-compose`)
COMPOSE_BIN=()
resolve_compose() {
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return 0
  fi
  if command -v docker-compose &>/dev/null; then
    COMPOSE_BIN=(docker-compose)
    return 0
  fi
  return 1
}
compose() {
  if [[ ${#COMPOSE_BIN[@]} -eq 0 ]]; then
    resolve_compose || {
      echo -e "${RED:-}✘ Docker Compose is not available (need 'docker compose' or 'docker-compose')${NC:-}" >&2
      return 1
    }
  fi
  "${COMPOSE_BIN[@]}" "$@"
}

# Official postgres image creates ONLY POSTGRES_USER as superuser (default panel_user).
# There is no DB role named "postgres" — never connect without -U panel_user.
pg_db_user() {
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    # shellcheck disable=SC1090
    POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "${INSTALL_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' || true)
  fi
  echo "${POSTGRES_USER:-panel_user}"
}

pg_exec() {
  docker exec hmpanel-postgres psql -U "$(pg_db_user)" "$@"
}

pg_exec_i() {
  docker exec -i hmpanel-postgres psql -U "$(pg_db_user)" "$@"
}

# Recreate empty panel_db if a failed pg_dumpall left the cluster without it.
ensure_panel_db_exists() {
  local db_user
  db_user=$(pg_db_user)
  local exists
  exists=$(docker exec hmpanel-postgres psql -U "$db_user" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='panel_db'" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "$exists" != "1" ]]; then
    echo -e "${YELLOW}⚠${NC}  panel_db is missing — creating empty database owned by ${db_user}..." >&2
    docker exec hmpanel-postgres psql -U "$db_user" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE panel_db OWNER \"${db_user}\";" >/dev/null 2>&1 \
      || echo -e "${RED}✘${NC}  Could not CREATE DATABASE panel_db" >&2
  fi
}

# Apply a plain-SQL dump (pg_dumpall or pg_dump output) into a fresh panel_db.
#
# POSTGRES_USER (panel_user) is the cluster bootstrap superuser, so the role
# statements inside a `pg_dumpall -c` archive can never run:
#   ERROR: cannot drop role panel_user because it is required by the database system
# Roles/passwords are owned by .env, not by the backup — so we execute ONLY the
# panel_db payload and recreate the database ourselves.
pg_restore_dump_file() {
  local sql_file="$1"
  local db_user section load_log
  db_user=$(pg_db_user)
  section=$(mktemp)

  # Cluster dumps carry every database; single-DB dumps have no \connect markers.
  local mode="all"
  if grep -qE '^\\connect ' "$sql_file"; then
    mode="section"
  fi

  # Keep only the panel_db payload, and strip cluster-level + `--clean`
  # statements: DROP ROLE panel_user can never run (bootstrap superuser) and
  # DROP TABLE/CONSTRAINT would abort against the empty database we create.
  # COPY blocks are passed through untouched so row data is never filtered.
  awk -v mode="$mode" '
    BEGIN { keep = (mode == "all") ? 1 : 0; copy = 0 }
    copy == 1 { print; if ($0 == "\\.") copy = 0; next }
    /^\\connect / { if (mode == "section") keep = ($0 ~ /panel_db/) ? 1 : 0; next }
    keep == 0 { next }
    /^[[:space:]]*(DROP|CREATE|ALTER)[[:space:]]+(ROLE|USER|DATABASE|TABLESPACE)[[:space:]]/ { next }
    /^[[:space:]]*DROP[[:space:]]/ { next }
    /^[[:space:]]*ALTER[[:space:]]+TABLE[[:space:]].*[[:space:]]DROP[[:space:]]+CONSTRAINT/ { next }
    { print; if ($0 ~ /^COPY .* FROM stdin;$/) copy = 1 }
  ' "$sql_file" > "$section"

  if [[ ! -s "$section" ]]; then
    echo -e "${RED}✘ Dump contains no restorable SQL for panel_db.${NC}" >&2
    rm -f "$section"
    return 1
  fi

  # GRANT statements inside the payload may reference roles from the source
  # cluster. Recreate them (login-less) so the load does not abort.
  local role
  for role in $(grep -oE '^CREATE ROLE [A-Za-z0-9_"$-]+' "$sql_file" 2>/dev/null \
    | awk '{print $3}' | tr -d '"' | sort -u); do
    [[ "$role" == "$db_user" ]] && continue
    docker exec hmpanel-postgres psql -U "$db_user" -d postgres -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE \"${role}\";
  END IF;
END
\$\$;
" >/dev/null 2>&1 || true
  done

  docker exec hmpanel-postgres psql -U "$db_user" -d postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'panel_db'
  AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

  # WITH (FORCE) needs PG13+; plain DROP is the fallback for older clusters.
  if ! docker exec hmpanel-postgres psql -U "$db_user" -d postgres -v ON_ERROR_STOP=1 \
    -c 'DROP DATABASE IF EXISTS panel_db WITH (FORCE);' >/dev/null 2>&1; then
    docker exec hmpanel-postgres psql -U "$db_user" -d postgres \
      -c 'DROP DATABASE IF EXISTS panel_db;' >/dev/null 2>&1 || true
  fi

  if ! docker exec hmpanel-postgres psql -U "$db_user" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE panel_db OWNER \"${db_user}\";" >/dev/null 2>&1; then
    echo -e "${RED}✘ Could not recreate panel_db.${NC}" >&2
    rm -f "$section"
    return 1
  fi

  load_log=$(mktemp)
  if docker exec -i hmpanel-postgres psql -U "$db_user" -d panel_db \
    -v ON_ERROR_STOP=1 --single-transaction >"$load_log" 2>&1 < "$section"; then
    rm -f "$section" "$load_log"
    return 0
  fi

  echo -e "${YELLOW}⚠${NC}  Strict load failed — retrying tolerantly (ownership/grant noise)." >&2
  tail -n 20 "$load_log" >&2 || true

  if docker exec -i hmpanel-postgres psql -U "$db_user" -d panel_db \
    >"$load_log" 2>&1 < "$section"; then
    local admin_rows
    admin_rows=$(docker exec hmpanel-postgres psql -U "$db_user" -d panel_db -tAc \
      'SELECT COUNT(*) FROM "Admin"' 2>/dev/null | tr -d '[:space:]' || echo 0)
    if [[ "${admin_rows:-0}" -ge 1 ]]; then
      echo -e "${YELLOW}⚠${NC}  Loaded with warnings (Admin rows: ${admin_rows})." >&2
      rm -f "$section" "$load_log"
      return 0
    fi
  fi

  echo -e "${RED}✘ Failed while loading panel_db payload.${NC}" >&2
  tail -n 60 "$load_log" >&2 || true
  rm -f "$section" "$load_log"
  ensure_panel_db_exists
  return 1
}

update_env() {
  local key="$1"
  local val="$2"
  local env_file="${INSTALL_DIR}/.env"
  local tmp_file="${INSTALL_DIR}/.env.tmp"
  
  if [[ -f "$env_file" ]]; then
    if grep -q "^${key}=" "$env_file"; then
      # Replace existing key safely
      awk -v k="$key" -v v="$val" -F'=' 'BEGIN{OFS="="} $1==k {$2=v; print; next} {print}' "$env_file" > "$tmp_file"
    else
      # Append new key
      cp "$env_file" "$tmp_file"
      echo "${key}=${val}" >> "$tmp_file"
    fi
    mv "$tmp_file" "$env_file"
    chmod 600 "$env_file" 2>/dev/null || true
  fi
}

# ─────────────────────────────────────────────────────────────────
# Global API Constants & Helpers
# ─────────────────────────────────────────────────────────────────
OPERATION_ID=$(date +%s%N 2>/dev/null | md5sum 2>/dev/null | head -c 8 || echo "unknown")
JSON_OUTPUT=false
if [[ " $* " == *" --json "* ]]; then
  JSON_OUTPUT=true
fi

DEBUG_MODE=false
if [[ " $* " == *" --debug "* || " $* " == *" --verbose "* || " $* " == *" -v "* ]]; then
  DEBUG_MODE=true
fi

output_json() {
  local success="$1"
  local code="$2"
  local extra_json="${3:-}"
  
  local json="{"
  json+="\"operation_id\": \"$OPERATION_ID\","
  json+="\"success\": $success,"
  json+="\"code\": \"$code\""
  if [[ -n "$extra_json" ]]; then
    json+=",$extra_json"
  fi
  json+="}"
  
  # When outputting JSON, we MUST only output JSON to stdout.
  # So we print it to stdout, and anything else should go to stderr or /dev/null
  echo "$json"
}

stream_progress() {
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "PROGRESS: $1" >&2
  else
    echo -e "${CYAN}➜ $1${NC}" >&2
  fi
}

ensure_env_variables() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ -f "$env_file" ]]; then
    if ! grep -q "^PANEL_PROTOCOL=" "$env_file"; then update_env "PANEL_PROTOCOL" "http"; fi
    if ! grep -q "^SSL_ENABLED=" "$env_file"; then update_env "SSL_ENABLED" "false"; fi
    if ! grep -q "^SSL_PROVIDER=" "$env_file"; then update_env "SSL_PROVIDER" "none"; fi
    if ! grep -q "^PANEL_DOMAIN=" "$env_file"; then
      local current_domain
      current_domain=$(grep "^DOMAIN=" "$env_file" | cut -d= -f2 || echo "localhost")
      update_env "PANEL_DOMAIN" "$current_domain"
    fi
  fi
}

ensure_env_variables

verify_dns() {
  local domain="$1"
  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$domain" == "localhost" ]]; then
    stream_progress "Skipping DNS verification for IP/localhost: $domain"
    VERIFY_STEP_MESSAGE="Skipped for IP/localhost"
    VERIFY_STEP_DETAILS="{\"skipped\": true}"
    return 0
  fi

  stream_progress "Verifying DNS resolution for $domain..."
  local ip=""
  if command -v dig &>/dev/null; then
    ip=$(dig +short A "$domain" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | tail -n1 || true)
  fi
  if [[ -z "$ip" ]] && command -v host &>/dev/null; then
    ip=$(host "$domain" 2>/dev/null | awk '/has address/ {print $NF}' | tail -n1 || true)
  fi
  if [[ -z "$ip" ]] && command -v getent &>/dev/null; then
    ip=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | head -n1 || true)
  fi
  if [[ -z "$ip" ]]; then
    # Last resort: ping won't work for resolution-only — try nslookup
    if command -v nslookup &>/dev/null; then
      ip=$(nslookup "$domain" 2>/dev/null | awk '/^Address: / {print $2}' | tail -n1 || true)
    fi
  fi

  if [[ -n "$ip" ]]; then
    VERIFY_STEP_MESSAGE="Resolved to $ip"
    VERIFY_STEP_DETAILS="{\"resolvedIp\": \"$ip\"}"
    if [[ -n "${VERIFY_LOG_FILE:-}" ]]; then echo "[verify_dns] DNS resolved $domain to $ip" >> "$VERIFY_LOG_FILE"; fi
    stream_progress "DNS verification passed ($ip)"
    return 0
  fi

  VERIFY_STEP_MESSAGE="DNS resolution failed"
  if [[ -n "${VERIFY_LOG_FILE:-}" ]]; then echo "[verify_dns] DNS failed for $domain" >> "$VERIFY_LOG_FILE"; fi
  stream_progress "DNS check failed: $domain does not resolve."
  return 1
}

verify_port_80() {
  stream_progress "Checking if port 80 is available..."
  local port_in_use=false
  if command -v ss &>/dev/null; then
    if ss -tuln | grep -q ":80 "; then port_in_use=true; fi
  elif command -v netstat &>/dev/null; then
    if netstat -tuln | grep -q ":80 "; then port_in_use=true; fi
  fi

  if [[ "$port_in_use" == true ]]; then
    local holding_process
    holding_process=$(lsof -i :80 -t 2>/dev/null | xargs ps -o comm= -p 2>/dev/null | head -n 1 || echo "")
    if [[ "$holding_process" == "docker" || "$holding_process" == "docker-proxy" ]]; then
      stream_progress "Detected process: ${holding_process}"
      stream_progress "Decision: Expected Docker process. Continuing..."
      return 0
    elif [[ "$holding_process" != "" ]]; then
      stream_progress "Detected process: ${holding_process}"
      stream_progress "Decision: External process detected. Cannot continue with SSL on port 80."
      return 1
    else
      stream_progress "Port 80 is occupied by an unknown process. Cannot continue with SSL on port 80."
      return 1
    fi
  fi
  stream_progress "Port 80 is available"
  return 0
}


LOCKFILE="/tmp/hmpanel_ssl.lock"
# Set to 1 before `docker stop hmpanel-nginx` during ACME; EXIT trap always restores it.
NGINX_STOPPED_FOR_SSL=0

ssl_restore_nginx_if_stopped() {
  if [[ "${NGINX_STOPPED_FOR_SSL:-0}" == "1" ]]; then
    docker start hmpanel-nginx >/dev/null 2>&1 || true
    NGINX_STOPPED_FOR_SSL=0
  fi
}

acquire_ssl_lock() {
  if [[ -f "$LOCKFILE" ]]; then
    local pid
    pid=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [[ -n "$pid" && "$pid" != "$$" ]] && kill -0 "$pid" 2>/dev/null; then
      if [[ "${JSON_OUTPUT:-}" == "true" ]]; then
        output_json false "SSL_OPERATION_IN_PROGRESS" "\"reason\":\"SSL operation already in progress (PID $pid).\""
        exit 49
      else
        echo -e "${RED}✘ SSL operation already in progress (PID $pid).${NC}"
        exit 1
      fi
    fi
  fi
  echo "$$" > "$LOCKFILE"
  # Always clear lock + restore nginx if a prior ACME step stopped it (timeout/kill/crash).
  trap 'rm -f "$LOCKFILE"; ssl_restore_nginx_if_stopped' EXIT
}

# .env is the source of truth for the panel domain. Callers that never sourced
# it (e.g. `hm ssl enable`) would otherwise regenerate nginx.conf with
# server_name localhost.
panel_domain() {
  local d="${PANEL_DOMAIN:-${DOMAIN:-}}"
  if [[ -z "$d" && -f "${INSTALL_DIR}/.env" ]]; then
    d=$(grep -E '^(PANEL_)?DOMAIN=' "${INSTALL_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)
  fi
  echo "${d:-localhost}"
}

# Host ports nginx is published on (.env HTTP_PORT / HTTPS_PORT).
env_value() {
  grep -E "^${1}=" "${INSTALL_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r' || true
}
panel_http_port() {
  local p
  p=$(env_value HTTP_PORT)
  [[ "$p" =~ ^[0-9]+$ ]] && echo "$p" || echo 80
}
panel_https_port() {
  local p
  p=$(env_value HTTPS_PORT)
  [[ "$p" =~ ^[0-9]+$ ]] && echo "$p" || echo 443
}

# True when something listens on TCP port $1 (any address).
port_listening() {
  local port="$1"
  if command -v ss &>/dev/null; then
    ss -Htln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}\$"
  elif command -v netstat &>/dev/null; then
    netstat -tln 2>/dev/null | awk 'NR>2 {print $4}' | grep -Eq "[:.]${port}\$"
  else
    (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null
  fi
}

reload_nginx() {
  local domain
  domain=$(panel_domain)
  docker exec \
    -e APP_PORT="${APP_PORT:-3000}" \
    -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
    -e PANEL_DOMAIN="$domain" \
    hmpanel-nginx sh -c "
      sh /etc/nginx/generate_config.sh && nginx -t && nginx -s reload
    " >/dev/null 2>&1 || docker restart hmpanel-nginx >/dev/null 2>&1 || true
}

reload_nginx_deferred() {
  (sleep 2 && reload_nginx) >/dev/null 2>&1 &
}

# The nginx container bakes PANEL_DOMAIN at create time from .env, and its
# entrypoint regenerates nginx.conf on every start. A `docker exec` reload uses
# the value we pass, but the next restart/reboot would silently rebuild the
# config with the OLD domain — so after a domain change the container must be
# recreated, not reloaded.
recreate_nginx() {
  cd "$INSTALL_DIR" 2>/dev/null || true
  compose up -d --force-recreate --no-deps nginx >/dev/null 2>&1 \
    || docker restart hmpanel-nginx >/dev/null 2>&1 \
    || true
  return 0
}

# generate_config.sh serves HTTPS whenever valid certs exist, so "disable HTTPS"
# only survives a restart if we leave this marker behind.
SSL_DISABLED_MARKER="${INSTALL_DIR}/nginx/ssl/.ssl_disabled"

ssl_mark_disabled() {
  mkdir -p "${INSTALL_DIR}/nginx/ssl"
  : > "$SSL_DISABLED_MARKER"
}

ssl_clear_disabled() {
  rm -f "$SSL_DISABLED_MARKER" 2>/dev/null || true
}

# Wait until nginx answers /api/health for $1. With $3=https only an HTTPS
# answer counts: an HTTP 200 would hide nginx silently staying on HTTP.
wait_for_nginx_health() {
  local domain="${1:-localhost}"
  local attempts="${2:-20}"
  local want="${3:-any}"
  local hp sp
  hp=$(panel_http_port)
  sp=$(panel_https_port)
  local i code_https code_http
  for ((i = 1; i <= attempts; i++)); do
    code_https=$(curl -s -o /dev/null -w "%{http_code}" -k --max-time 4 \
      --resolve "${domain}:${sp}:127.0.0.1" "https://${domain}:${sp}/api/health" 2>/dev/null || echo "000")
    if [[ "$code_https" == "200" ]]; then
      return 0
    fi
    if [[ "$want" != "https" ]]; then
      code_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 \
        --resolve "${domain}:${hp}:127.0.0.1" "http://${domain}:${hp}/api/health" 2>/dev/null || echo "000")
      if [[ "$code_http" == "200" ]]; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

# Informational flags shown by `hm ssl status`; nginx itself follows the cert
# files and the .ssl_disabled marker.
ssl_set_env_state() {
  if [[ "$1" == "https" ]]; then
    update_env "PANEL_PROTOCOL" "https"
    update_env "SSL_ENABLED" "true"
  else
    update_env "PANEL_PROTOCOL" "http"
    update_env "SSL_ENABLED" "false"
  fi
}

run_timeout() {
  local secs="$1"
  shift
  if command -v timeout &>/dev/null; then
    timeout "$secs" "$@"
  else
    "$@"
  fi
}

ACME_HOME="${INSTALL_DIR}/acme.sh"
# An interactive root shell sources acme.sh.env, which can point LE_CONFIG_HOME
# elsewhere. Unset it so the panel UI and the terminal share one cert store.
unset LE_CONFIG_HOME

find_acme_bin() {
  local candidate
  for candidate in "${ACME_HOME}/acme.sh" "/root/.acme.sh/acme.sh" "${HOME:-/root}/.acme.sh/acme.sh"; do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  command -v acme.sh 2>/dev/null || true
}

# acme.sh (v3+) stores ECDSA certificates under <domain>_ecc.
acme_ecc_flag() {
  local rsa="${ACME_HOME}/${1}/${1}.conf"
  local ecc="${ACME_HOME}/${1}_ecc/${1}.conf"
  if [[ -f "$ecc" && ( ! -f "$rsa" || "$ecc" -nt "$rsa" ) ]]; then
    echo "--ecc"
  fi
}

acme_conf_value() {
  sed -n "s/^${2}=['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}\$/\1/p" "$1" 2>/dev/null | head -n1 || true
}

cert_valid_for_domain() {
  local cert="$1" domain="$2"
  [[ -f "$cert" ]] || return 1
  openssl x509 -checkend 0 -noout -in "$cert" >/dev/null 2>&1 || return 1
  openssl x509 -noout -checkhost "$domain" -in "$cert" 2>/dev/null | grep -q "does match"
}

ssl_public_ipv4() {
  local ip=""
  ip=$(curl -4 -s --max-time 5 https://api.ipify.org 2>/dev/null | tr -d '[:space:]' || true)
  if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    ip=$(curl -4 -s --max-time 5 https://icanhazip.com 2>/dev/null | tr -d '[:space:]' || true)
  fi
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$ip"
  fi
}

ssl_resolve_a() {
  local ips=""
  if command -v dig &>/dev/null; then
    ips=$(dig +short A "$1" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | sort -u | tr '\n' ' ' || true)
  fi
  if [[ -z "$ips" ]] && command -v getent &>/dev/null; then
    ips=$(getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
  fi
  echo "${ips% }"
}

# Serves a token from the ACME webroot and fetches it through public DNS, the
# way the CA will (redirects included, e.g. Cloudflare "Always Use HTTPS").
ssl_http01_selftest() {
  local domain="$1"
  local dir="${INSTALL_DIR}/nginx/acme/.well-known/acme-challenge"
  local token="hm-selftest-${RANDOM}${RANDOM}$(date +%s)"
  local body=""
  mkdir -p "$dir"
  printf '%s' "$token" > "${dir}/${token}" 2>/dev/null || return 1
  chmod 644 "${dir}/${token}" 2>/dev/null || true
  body=$(curl -s -L -k --max-redirs 5 --max-time 10 \
    "http://${domain}/.well-known/acme-challenge/${token}" 2>/dev/null || true)
  rm -f "${dir}/${token}"
  [[ "$body" == "$token" ]]
}

# Most specific CA/ACME error line from a log, JSON-safe.
ssl_log_hint() {
  local log="$1" line=""
  [[ -f "$log" ]] || return 0
  line=$(grep -aiE 'rate.?limit|too many|caa|unauthorized|invalid response|connection refused|timed? ?out|dns problem|nxdomain|error' "$log" 2>/dev/null \
    | sed 's/^\[[^]]*\] *//' | tail -n 1 || true)
  if [[ -n "$line" ]]; then
    clean_json_val "$line"
  fi
}

json_escape_log_tail() {
  tail -n "${2:-15}" "$1" 2>/dev/null \
    | sed 's/^\[[^]]*\] *//' \
    | tr '\t' ' ' \
    | tr -d '\r\000-\010\013\014\016-\037' \
    | sed 's/\\/\\\\/g; s/"/\\"/g' \
    | awk '{printf "%s\\n", $0}' || true
}

# Issues (or reuses a still-valid) acme.sh certificate for $PANEL_DOMAIN and
# installs it into nginx/ssl. Extra args pick the challenge (--webroot DIR | --standalone).
acme_issue_and_install() {
  local acme_bin="$1" ca="$2" email="$3" log="$4"
  shift 4
  local rc=0
  "$acme_bin" --home "$ACME_HOME" --register-account -m "$email" --server "$ca" >>"$log" 2>&1 || true
  run_timeout "${ACME_ISSUE_TIMEOUT:-150}" "$acme_bin" --home "$ACME_HOME" --issue \
    -d "$PANEL_DOMAIN" --server "$ca" "$@" >>"$log" 2>&1 || rc=$?
  # 2 = acme.sh already holds a valid certificate for this domain. Reusing it
  # avoids burning the CA's weekly duplicate-certificate limit.
  if [[ $rc -ne 0 && $rc -ne 2 ]]; then
    return 1
  fi
  # shellcheck disable=SC2046
  "$acme_bin" --home "$ACME_HOME" --install-cert -d "$PANEL_DOMAIN" $(acme_ecc_flag "$PANEL_DOMAIN") \
    --fullchain-file "${INSTALL_DIR}/nginx/ssl/fullchain.pem" \
    --key-file "${INSTALL_DIR}/nginx/ssl/privkey.pem" >>"$log" 2>&1 || return 1
  cert_valid_for_domain "${INSTALL_DIR}/nginx/ssl/fullchain.pem" "$PANEL_DOMAIN"
}


# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Check root
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}✘ This command must be run as root.${NC} Try: sudo hmpanel"
  exit 1
fi

print_header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗███╗   ███╗██████╗  █████╗ ███╗   ██╗███████╗██╗     "
  echo "  ██║  ██║████╗ ████║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
  echo "  ███████║██╔████╔██║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
  echo "  ██╔══██║██║╚██╔╝██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
  echo "  ██║  ██║██║ ╚═╝ ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
  echo "  ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}HMPanel CLI Manager — Community Edition${NC}\n"
}

HEADLESS="${HEADLESS:-false}"

pause() {
  if [[ "$HEADLESS" == "true" ]]; then
    return
  fi
  echo ""
  read -rp "Press Enter to return to the menu..."
}

get_container_status() {
  local container="$1"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
  if [[ "$status" == "running" ]]; then
    echo -e "${GREEN}Running${NC}"
  elif [[ "$status" == "missing" ]]; then
    echo -e "${RED}Not Found${NC}"
  else
    echo -e "${YELLOW}${status}${NC}"
  fi
}

cmd_status() {
  echo -e "${BOLD}--- Panel Status ---${NC}\n"
  
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    source "${INSTALL_DIR}/.env"
  fi

  local app_version="Unknown"
  if docker exec hmpanel-panel sh -c 'test -f /app/VERSION' &>/dev/null; then
    app_version=$(docker exec hmpanel-panel sh -c 'tr -d "\r\n" < /app/VERSION' 2>/dev/null | tr -d '\r')
  elif docker exec hmpanel-panel printenv APP_VERSION &>/dev/null; then
    app_version=$(docker exec hmpanel-panel printenv APP_VERSION 2>/dev/null | tr -d '\r')
  elif docker exec hmpanel-panel node -p "require('./package.json').version" >/dev/null 2>&1; then
    app_version=$(docker exec hmpanel-panel node -p "require('./package.json').version" | tr -d '\r')
  elif docker inspect hmpanel-panel >/dev/null 2>&1; then
    # Fallback to checking image tag if container is down or node fails
    local image_name
    image_name=$(docker inspect -f '{{.Config.Image}}' hmpanel-panel 2>/dev/null)
    app_version="${image_name##*:}"
  fi

  echo -e "  Version:       ${CYAN}${app_version}${NC}"
  echo -e "  Edition:       ${CYAN}Community Edition${NC}"
  echo -e "  Domain:        ${CYAN}${DOMAIN:-Unknown}${NC}"
  echo ""
  echo -e "  ${BOLD}Containers:${NC}"
  echo -e "  Frontend/API:  $(get_container_status hmpanel-panel)"
  echo -e "  PostgreSQL:    $(get_container_status hmpanel-postgres)"
  echo -e "  Redis:         $(get_container_status hmpanel-redis)"
  echo -e "  Nginx:         $(get_container_status hmpanel-nginx)"
  pause
}

cmd_info() {
  echo -e "${BOLD}--- Panel Information ---${NC}\n"
  echo -e "  Install Path:  ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "  Backups Path:  ${CYAN}${BACKUP_DIR}${NC}"
  echo -e "  Logs Path:     ${CYAN}${INSTALL_DIR}/logs${NC}"
  echo -e "  SSL Path:      ${CYAN}${INSTALL_DIR}/nginx/ssl${NC}"
  echo ""
  echo -e "  Useful Commands:"
  echo -e "  - View raw compose logs: ${YELLOW}$(resolve_compose >/dev/null 2>&1; echo "${COMPOSE_BIN[*]:-docker compose}") -f ${INSTALL_DIR}/docker-compose.yml logs -f${NC}"
  echo -e "  - Inspect database:      ${YELLOW}docker exec -it hmpanel-postgres psql -U panel_user -d panel_db${NC}"
  pause
}

cmd_update() {
  echo -e "${BOLD}--- Update HMPanel ---${NC}\n"
  echo "Downloading master updater from GitHub..."
  if curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh | bash; then
    echo -e "${GREEN}✔ Update complete!${NC}"
  else
    echo -e "${RED}✘ Update failed!${NC}"
  fi
  pause
}

cmd_heal() {
  echo -e "${BOLD}--- Heal HMPanel (emergency) ---${NC}\n"
  if curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/heal-panel.sh | bash; then
    echo -e "${GREEN}✔ Heal finished.${NC}"
  else
    echo -e "${RED}✘ Heal failed — check docker logs.${NC}"
  fi
  pause
}

do_backup() {
  local backup_type="${1:-full}" # full, database, config
  local silent="${2:-false}"
  
  local app_ver="unknown"
  if [[ -f "${INSTALL_DIR}/VERSION" ]]; then
    app_ver=$(tr -d '\r\n' < "${INSTALL_DIR}/VERSION")
  elif [[ -f "${INSTALL_DIR}/package.json" ]]; then
    app_ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)
    app_ver="${app_ver:-unknown}"
  fi
  
  mkdir -p "${BACKUP_DIR}"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local filename="backup_${backup_type}_$(date +%F_%H-%M-%S).tar.gz"
  local filepath="${BACKUP_DIR}/${filename}"
  
  local temp_dir=$(mktemp -d)
  
  if [[ "$silent" != "true" ]]; then echo "Creating $backup_type backup..."; fi
  
  local checksums=""
  local components_json="["
  local first_component=1
  
  add_component() {
    local name="$1"
    if [[ $first_component -eq 1 ]]; then
      first_component=0
    else
      components_json+=", "
    fi
    components_json+="\"$name\""
  }
  
  if [[ "$backup_type" == "database" || "$backup_type" == "full" ]]; then
    if [[ "$silent" != "true" ]]; then echo " -> Exporting database..."; fi
    if docker exec hmpanel-postgres pg_dumpall -c -U panel_user | gzip > "${temp_dir}/database.sql.gz"; then
      local db_sum=$(sha256sum "${temp_dir}/database.sql.gz" | awk '{print $1}')
      checksums+="\"database.sql.gz\": \"$db_sum\""
      add_component "database.sql.gz"
    else
      if [[ "$silent" != "true" ]]; then echo -e "${RED}✘ Database export failed.${NC}"; fi
      rm -rf "$temp_dir"
      return 1
    fi
  fi
  
  if [[ "$backup_type" == "config" || "$backup_type" == "full" ]]; then
    if [[ "$silent" != "true" ]]; then echo " -> Archiving configuration..."; fi
    local conf_temp=$(mktemp -d)
    cp "${INSTALL_DIR}/.env" "$conf_temp/" 2>/dev/null || true
    cp -r "${INSTALL_DIR}/nginx" "$conf_temp/" 2>/dev/null || true
    # ACME state for SSL renewals after migrate
    if [[ -d "${INSTALL_DIR}/acme.sh" ]]; then
      cp -r "${INSTALL_DIR}/acme.sh" "$conf_temp/" 2>/dev/null || true
    fi
    tar -czf "${temp_dir}/config.tar.gz" -C "$conf_temp" .
    rm -rf "$conf_temp"
    
    local conf_sum=$(sha256sum "${temp_dir}/config.tar.gz" | awk '{print $1}')
    if [[ -n "$checksums" ]]; then checksums+=", "; fi
    checksums+="\"config.tar.gz\": \"$conf_sum\""
    add_component "config.tar.gz"
  fi

  # Full backups include uploads, premium modules, and instance id
  if [[ "$backup_type" == "full" ]]; then
    if [[ "$silent" != "true" ]]; then echo " -> Archiving uploads (branding assets)..."; fi
    if docker exec hmpanel-panel test -d /app/uploads 2>/dev/null; then
      if docker exec hmpanel-panel tar -czf - -C /app/uploads . > "${temp_dir}/uploads.tar.gz" 2>/dev/null; then
        if [[ -s "${temp_dir}/uploads.tar.gz" ]]; then
          local up_sum=$(sha256sum "${temp_dir}/uploads.tar.gz" | awk '{print $1}')
          if [[ -n "$checksums" ]]; then checksums+=", "; fi
          checksums+="\"uploads.tar.gz\": \"$up_sum\""
          add_component "uploads.tar.gz"
        else
          rm -f "${temp_dir}/uploads.tar.gz"
          if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Uploads archive empty — skipped.${NC}"; fi
        fi
      else
        rm -f "${temp_dir}/uploads.tar.gz"
        if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Could not archive uploads volume.${NC}"; fi
      fi
    else
      if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Panel container uploads path not found.${NC}"; fi
    fi

    if [[ "$silent" != "true" ]]; then echo " -> Archiving premium modules..."; fi
    if docker exec hmpanel-panel test -d /opt/hmpanel/premium 2>/dev/null; then
      if docker exec hmpanel-panel tar -czf - -C /opt/hmpanel/premium . > "${temp_dir}/premium.tar.gz" 2>/dev/null; then
        if [[ -s "${temp_dir}/premium.tar.gz" ]] && [[ $(stat -c%s "${temp_dir}/premium.tar.gz" 2>/dev/null || echo 0) -gt 32 ]]; then
          local prem_sum=$(sha256sum "${temp_dir}/premium.tar.gz" | awk '{print $1}')
          if [[ -n "$checksums" ]]; then checksums+=", "; fi
          checksums+="\"premium.tar.gz\": \"$prem_sum\""
          add_component "premium.tar.gz"
        else
          rm -f "${temp_dir}/premium.tar.gz"
          if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Premium archive empty — skipped.${NC}"; fi
        fi
      else
        rm -f "${temp_dir}/premium.tar.gz"
        if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Could not archive premium volume.${NC}"; fi
      fi
    else
      if [[ "$silent" != "true" ]]; then echo -e "${YELLOW}⚠ Premium path not found (Community install?).${NC}"; fi
    fi

    # Persist license instance id when available (backups volume)
    local instance_tmp="${temp_dir}/.hmpanel-instance-id"
    if docker exec hmpanel-panel test -f /app/backups/.hmpanel-instance-id 2>/dev/null; then
      docker exec hmpanel-panel cat /app/backups/.hmpanel-instance-id > "$instance_tmp" 2>/dev/null || true
    elif [[ -f "${BACKUP_DIR}/.hmpanel-instance-id" ]]; then
      cp "${BACKUP_DIR}/.hmpanel-instance-id" "$instance_tmp" 2>/dev/null || true
    fi
    if [[ -s "$instance_tmp" ]]; then
      add_component ".hmpanel-instance-id"
    else
      rm -f "$instance_tmp"
    fi
  fi

  components_json+="]"
  
  cat > "${temp_dir}/manifest.json" <<EOF
{
  "version": "$app_ver",
  "schemaVersion": "3",
  "timestamp": "$timestamp",
  "type": "$backup_type",
  "domain": "${PANEL_DOMAIN:-localhost}",
  "components": $components_json,
  "checksums": {
    $checksums
  }
}
EOF

  tar -czf "$filepath" -C "$temp_dir" .
  rm -rf "$temp_dir"

  # Keep disk usage bounded: drop old backups of the same type (and stale rollbacks)
  prune_old_backups "$backup_type"
  
  if [[ "$silent" != "true" ]]; then
    echo -e "${GREEN}✔ Backup completed successfully!${NC}"
    echo -e "Saved to: ${CYAN}${filepath}${NC}"
  fi
  echo "$filepath"
  return 0
}

# Keep the newest N archives per type under BACKUP_DIR (default 5).
# Also prune ancient rollback_* / pre-update leftovers older than keep window.
prune_old_backups() {
  local backup_type="${1:-full}"
  local keep="${HMPANEL_BACKUP_KEEP:-5}"
  if ! [[ "$keep" =~ ^[0-9]+$ ]] || [[ "$keep" -lt 1 ]]; then
    keep=5
  fi
  mkdir -p "${BACKUP_DIR}"

  prune_glob() {
    local pattern="$1"
    local keep_n="$2"
    # Newest first (by mtime), delete beyond keep_n
    local files=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(ls -1t ${pattern} 2>/dev/null || true)
    local i=0
    local f
    for f in "${files[@]}"; do
      i=$((i + 1))
      if [[ $i -gt $keep_n ]]; then
        rm -f "$f" 2>/dev/null || true
      fi
    done
  }

  prune_glob "${BACKUP_DIR}/backup_${backup_type}_*.tar.gz" "$keep"
  # Always bound full / database / config families independently when called for full
  if [[ "$backup_type" == "full" ]]; then
    prune_glob "${BACKUP_DIR}/backup_database_*.tar.gz" "$keep"
    prune_glob "${BACKUP_DIR}/backup_config_*.tar.gz" "$keep"
  fi
  # SQL dumps and misc rollback tarballs
  prune_glob "${BACKUP_DIR}/backup_*.sql" "$keep"
  prune_glob "${BACKUP_DIR}/rollback_*.tar.gz" "$keep"
  prune_glob "${BACKUP_DIR}/*pre*update*.tar.gz" "$keep"
}

cmd_backup() {
  echo -e "${BOLD}--- Create Backup ---${NC}\n"
  echo "1. Full Backup (Database + Config + Uploads + Premium)"
  echo "2. Database Only"
  echo "3. Configuration Only (.env + nginx + acme)"
  echo "0. Cancel"
  read -rp "Select backup type: " btype
  
  case $btype in
    1) do_backup "full" "false" ;;
    2) do_backup "database" "false" ;;
    3) do_backup "config" "false" ;;
    *) echo "Cancelled." ;;
  esac
  pause
}

# Resolve a backup path for restore:
# - absolute host path
# - basename under BACKUP_DIR (bind-mounted ./backups)
# - docker cp from panel container /app/backups (legacy named volume)
resolve_restore_filepath() {
  local input="$1"
  local name
  name=$(basename "$input")

  if [[ -f "$input" ]]; then
    echo "$input"
    return 0
  fi
  if [[ -f "${BACKUP_DIR}/${name}" ]]; then
    echo "${BACKUP_DIR}/${name}"
    return 0
  fi

  mkdir -p "${BACKUP_DIR}"
  if docker exec hmpanel-panel test -f "/app/backups/${name}" 2>/dev/null; then
    if docker cp "hmpanel-panel:/app/backups/${name}" "${BACKUP_DIR}/${name}" 2>/dev/null; then
      echo "${BACKUP_DIR}/${name}"
      return 0
    fi
  fi
  return 1
}

wait_for_panel_health() {
  local attempts="${1:-24}"
  local i=0
  while [[ $i -lt $attempts ]]; do
    if docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      return 0
    fi
    # Fallback: status field without strict JSON quoting
    if docker exec hmpanel-panel curl -sf "http://127.0.0.1:4000/health" 2>/dev/null | grep -Eq 'ok'; then
      return 0
    fi
    i=$((i + 1))
    sleep 5
  done
  return 1
}

# After restore, Postgres role password (inside volume) and panel DATABASE_URL
# (frozen at container create) can diverge from /opt/hmpanel/.env.
# Force both to match the final .env — otherwise panel crash-loops with:
#   FATAL: password authentication failed for user "panel_user"
sync_credentials_after_restore() {
  local silent="${1:-false}"
  if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    return 0
  fi

  set -a
  # shellcheck disable=SC1091
  source "${INSTALL_DIR}/.env"
  set +a

  local db_user="${POSTGRES_USER:-panel_user}"
  local db_pass="${POSTGRES_PASSWORD:-}"

  if [[ -n "$db_pass" ]]; then
    if [[ "$silent" != "true" ]]; then
      echo "Syncing PostgreSQL role password to match .env..."
    fi
    # Use postgres OS user to avoid chicken/egg auth failure when role password
    # already diverged from what panel_user clients expect.
    local escaped_pass="${db_pass//\'/\'\'}"
    if ! pg_exec -d postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"${db_user}\" WITH PASSWORD '${escaped_pass}';" >/dev/null 2>&1; then
      if [[ "$silent" != "true" ]]; then
        echo -e "${YELLOW}⚠ Could not ALTER ROLE ${db_user} — retrying...${NC}"
      fi
      sleep 2
      pg_exec -d postgres -v ON_ERROR_STOP=1 \
        -c "ALTER ROLE \"${db_user}\" WITH PASSWORD '${escaped_pass}';" >/dev/null 2>&1 || true
    fi
  fi

  cd "$INSTALL_DIR" || return 1

  # Order matters: redis must be ready with the restored password BEFORE panel-app
  # starts, otherwise Nest crash-loops and nginx returns 502.
  if [[ "$silent" != "true" ]]; then
    echo "Recreating redis / panel-app / nginx so env matches restored .env..."
  fi
  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    compose up -d --force-recreate --no-deps redis >/dev/null 2>&1 || true
    sleep 2
  fi
  compose up -d --force-recreate --no-deps panel-app >/dev/null 2>&1 || \
    compose up -d --force-recreate panel-app >/dev/null 2>&1 || true
  sleep 3
  compose up -d --force-recreate --no-deps nginx >/dev/null 2>&1 || \
    compose up -d --no-deps nginx >/dev/null 2>&1 || \
    docker restart hmpanel-nginx >/dev/null 2>&1 || true
  return 0
}

do_restore() {
  local input_path="$1"
  local silent="${2:-false}"
  local is_rollback="${3:-false}"

  # Always visible progress/errors on stderr (even when silent/API mode).
  rmsg() { echo -e "$*" >&2; }
  
  local filepath
  if ! filepath=$(resolve_restore_filepath "$input_path"); then
    rmsg "${RED}✘ File not found: ${input_path}${NC}"
    rmsg "  Looked in: ${BACKUP_DIR}/"
    rmsg "  Available:"
    ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | sed 's|.*/|    |' >&2 || rmsg "    (none)"
    return 1
  fi
  rmsg "${BLUE}ℹ${NC}  Restoring from: ${filepath}"
  
  local temp_dir
  temp_dir=$(mktemp -d)
  
  if [[ "$filepath" == *.sql || "$filepath" == *.sql.gz ]]; then
    rmsg "Legacy SQL backup detected. Proceeding with database restore..."
    compose stop panel-app >/dev/null 2>&1 || docker stop hmpanel-panel >/dev/null 2>&1 || true
    sleep 2
    local ret=1
    local legacy_sql
    legacy_sql=$(mktemp)
    if [[ "$filepath" == *.sql.gz ]]; then
      zcat "$filepath" > "$legacy_sql" 2>/dev/null || true
    else
      cp "$filepath" "$legacy_sql"
    fi
    if [[ -s "$legacy_sql" ]] && pg_restore_dump_file "$legacy_sql"; then
      ret=0
    fi
    rm -f "$legacy_sql"
    rm -rf "$temp_dir"
    sync_credentials_after_restore "$silent" || true
    if [[ $ret -eq 0 ]]; then
      rmsg "${GREEN}✔ Legacy restore completed successfully!${NC}"
      return 0
    else
      rmsg "${RED}✘ Legacy restore failed.${NC}"
      return 1
    fi
  fi
  
  # New Tar.gz Restore (Transactional)
  if ! tar -xzf "$filepath" -C "$temp_dir"; then
    rmsg "${RED}✘ Failed to extract archive: ${filepath}${NC}"
    rm -rf "$temp_dir"
    return 1
  fi
  if [[ ! -f "${temp_dir}/manifest.json" ]]; then
    rmsg "${RED}✘ Invalid backup format: missing manifest.json${NC}"
    rmsg "  Archive contents:"
    ls -la "$temp_dir" >&2 || true
    rm -rf "$temp_dir"
    return 1
  fi
  
  local btype
  btype=$(sed -n 's/.*"type": *"\([^"]*\)".*/\1/p' "${temp_dir}/manifest.json" | head -n 1)
  btype="${btype:-unknown}"
  rmsg "Starting transactional restore (${btype})..."
  rmsg "  Components in archive: $(ls -1 "$temp_dir" | tr '\n' ' ')"
  
  # 1. Create Rollback Backup (skip when we are already rolling back)
  local rollback_file=""
  if [[ "$is_rollback" != "true" ]]; then
    rmsg "Creating automatic rollback backup..."
    rollback_file=$(do_backup "full" "true")
    if [[ -z "$rollback_file" || ! -f "$rollback_file" ]]; then
      rmsg "${RED}✘ Failed to create rollback backup. Restore aborted.${NC}"
      rm -rf "$temp_dir"
      return 1
    fi
    rmsg "  Rollback snapshot: ${rollback_file}"
  fi
  
  # 2. Execute Restore
  local restore_failed=0
  local db_restore_applied=0
  
  if [[ -f "${temp_dir}/database.sql.gz" ]]; then
    rmsg "Restoring database..."
    rmsg "Stopping panel-app to free database connections..."
    cd "$INSTALL_DIR" || true
    compose stop panel-app >/dev/null 2>&1 || docker stop hmpanel-panel >/dev/null 2>&1 || true
    sleep 2

    local plain_sql
    plain_sql=$(mktemp)
    if ! zcat "${temp_dir}/database.sql.gz" > "$plain_sql" 2>/dev/null; then
      rmsg "${RED}✘ Could not decompress database.sql.gz${NC}"
      rm -f "$plain_sql"
      restore_failed=1
    else
      rmsg "  Dump size: $(du -h "$plain_sql" | awk '{print $1}') — recreating panel_db and loading data..."
      if pg_restore_dump_file "$plain_sql"; then
        db_restore_applied=1
        rmsg "${GREEN}✔${NC}  Database replaced with backup contents."
      else
        restore_failed=1
        ensure_panel_db_exists
        compose start panel-app >/dev/null 2>&1 || true
      fi
      rm -f "$plain_sql"
    fi
  else
    rmsg "${YELLOW}⚠${NC}  No database.sql.gz in archive — DB will NOT change."
  fi
  
  if [[ $restore_failed -eq 0 && -f "${temp_dir}/config.tar.gz" ]]; then
    rmsg "Restoring configuration (.env / nginx / acme)..."
    tar -xzf "${temp_dir}/config.tar.gz" -C "${INSTALL_DIR}"
  fi

  if [[ $restore_failed -eq 0 ]]; then
    if [[ -f "${temp_dir}/database.sql.gz" || -f "${temp_dir}/config.tar.gz" ]]; then
      sync_credentials_after_restore "$silent" || true
      sleep 3
    fi
  fi

  if [[ $restore_failed -eq 0 && $db_restore_applied -eq 1 ]]; then
    local admin_n=0
    admin_n=$(pg_exec -d panel_db -tAc 'SELECT COUNT(*) FROM "Admin"' 2>/dev/null | tr -d '[:space:]' || echo 0)
    if [[ "${admin_n:-0}" -lt 1 ]]; then
      rmsg "${RED}✘ Database restore left an empty Admin table — treating as failed.${NC}"
      restore_failed=1
      db_restore_applied=0
    else
      local client_n=0 panel_n=0
      client_n=$(pg_exec -d panel_db -tAc 'SELECT COUNT(*) FROM "Client"' 2>/dev/null | tr -d '[:space:]' || echo 0)
      panel_n=$(pg_exec -d panel_db -tAc 'SELECT COUNT(*) FROM "Panel"' 2>/dev/null | tr -d '[:space:]' || echo 0)
      rmsg "Database verify: Admin=${admin_n} Panel=${panel_n} Client=${client_n}"
    fi
  fi

  if [[ $restore_failed -eq 0 && -f "${temp_dir}/database.sql.gz" && $db_restore_applied -ne 1 ]]; then
    rmsg "${RED}✘ database.sql.gz was present but not applied.${NC}"
    restore_failed=1
  fi

  # Uploads / premium via named volumes — do NOT require panel-app to be healthy
  if [[ $restore_failed -eq 0 && -f "${temp_dir}/uploads.tar.gz" ]]; then
    rmsg "Restoring uploads volume..."
    if docker run --rm \
      -v hmpanel_uploads:/dest \
      -v "${temp_dir}/uploads.tar.gz:/backup.tar.gz:ro" \
      alpine sh -c 'mkdir -p /dest && tar -xzf /backup.tar.gz -C /dest'; then
      rmsg "${GREEN}✔${NC}  Uploads restored."
    else
      rmsg "${YELLOW}⚠ Uploads restore failed (continuing).${NC}"
    fi
  elif [[ $restore_failed -eq 0 && "$btype" == "full" ]]; then
    rmsg "${YELLOW}⚠ This full backup has no uploads.tar.gz${NC}"
  fi

  if [[ $restore_failed -eq 0 && -f "${temp_dir}/premium.tar.gz" ]]; then
    rmsg "Restoring premium modules volume (license bundle)..."
    if docker run --rm \
      -v hmpanel_premium:/dest \
      -v "${temp_dir}/premium.tar.gz:/backup.tar.gz:ro" \
      alpine sh -c 'mkdir -p /dest && tar -xzf /backup.tar.gz -C /dest && ls -la /dest | head'; then
      rmsg "${GREEN}✔${NC}  Premium modules restored."
    else
      rmsg "${YELLOW}⚠ Premium volume restore failed — re-download bundle from License UI if needed.${NC}"
    fi
  elif [[ $restore_failed -eq 0 && "$btype" == "full" ]]; then
    rmsg "${YELLOW}⚠ No premium.tar.gz in this backup — premium files on disk were not replaced.${NC}"
  fi

  if [[ $restore_failed -eq 0 && -f "${temp_dir}/.hmpanel-instance-id" ]]; then
    rmsg "Restoring instance id..."
    mkdir -p "${BACKUP_DIR}"
    cp "${temp_dir}/.hmpanel-instance-id" "${BACKUP_DIR}/.hmpanel-instance-id" 2>/dev/null || true
    # Also into panel backups mount once panel is up
    docker exec -i hmpanel-panel sh -c 'mkdir -p /app/backups && cat > /app/backups/.hmpanel-instance-id' \
      < "${temp_dir}/.hmpanel-instance-id" 2>/dev/null || true
  fi
  
  if [[ $restore_failed -eq 0 ]]; then
    rmsg "Verifying panel health..."
    if ! wait_for_panel_health 36; then
      rmsg "${YELLOW}Health slow — re-syncing credentials and retrying...${NC}"
      sync_credentials_after_restore "$silent" || true
      if ! wait_for_panel_health 24; then
        rmsg "${RED}✘ Health verification failed!${NC}"
        restore_failed=1
      fi
    fi
  fi
  
  if [[ $restore_failed -eq 1 ]]; then
    if [[ "$is_rollback" == "true" ]]; then
      rmsg "${RED}✘ Rollback restore also failed.${NC}"
      rm -rf "$temp_dir"
      return 1
    fi
    if [[ $db_restore_applied -eq 1 ]]; then
      rmsg "${YELLOW}⚠ Keeping restored database (will NOT roll back).${NC}"
      rmsg "${YELLOW}  Run: curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/heal-panel.sh | bash${NC}"
      rmsg "${YELLOW}  Rollback snapshot kept at: ${rollback_file}${NC}"
      sync_credentials_after_restore "$silent" || true
      rm -rf "$temp_dir"
      return 1
    fi
    if [[ -n "$rollback_file" && -f "$rollback_file" ]]; then
      rmsg "${YELLOW}Rolling back to previous state...${NC}"
      ensure_panel_db_exists
      do_restore "$rollback_file" "false" "true"
    fi
    rmsg "${RED}✘ Restore failed.${NC}"
    rm -rf "$temp_dir"
    return 1
  else
    rmsg "${GREEN}✔ Restore completed and verified!${NC}"
    rm -rf "$temp_dir"
    return 0
  fi
}

cmd_restore() {
  echo -e "${BOLD}--- Restore Backup ---${NC}\n"
  echo "Available backups in ${BACKUP_DIR}:"
  ls -1 "${BACKUP_DIR}"/*.sql "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | awk -F/ '{print " - " $NF}' || echo "  (No backups found)"
  
  echo ""
  read -rp "Enter the exact filename to restore (or press Enter to cancel): " filename
  if [[ -z "$filename" ]]; then
    return
  fi

  local filepath="${BACKUP_DIR}/${filename}"
  if [[ ! -f "$filepath" ]]; then
    echo -e "${RED}✘ File not found: ${filepath}${NC}"
    pause
    return
  fi

  echo -e "${YELLOW}⚠ WARNING: Restoring will overwrite the current installation entirely!${NC}"
  read -rp "Are you absolutely sure? [y/N]: " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Restore cancelled."
    pause
    return
  fi

  do_restore "$filepath" "false"
  pause
}

cmd_restart() {
  echo -e "${BOLD}--- Restart Services ---${NC}\n"
  cd "$INSTALL_DIR" || return
  echo "Restarting all containers..."
  compose restart
  echo -e "${GREEN}✔ Services restarted.${NC}"
  pause
}

cmd_logs() {
  echo -e "${BOLD}--- View Logs ---${NC}\n"
  echo "Select a service to tail (Press Ctrl+C to stop viewing):"
  echo "1) All Services"
  echo "2) Panel App (Frontend/Backend)"
  echo "3) Nginx"
  echo "4) PostgreSQL"
  echo "5) Redis"
  echo "0) Back"
  read -rp "Choice: " choice

  cd "$INSTALL_DIR" || return
  echo ""
  case $choice in
    1) compose logs -f --tail 100 ;;
    2) compose logs -f --tail 100 panel-app ;;
    3) compose logs -f --tail 100 nginx ;;
    4) compose logs -f --tail 100 postgres ;;
    5) compose logs -f --tail 100 redis ;;
    0) return ;;
    *) echo -e "${RED}Invalid option${NC}" ; sleep 1 ;;
  esac
}

verify_nginx_status() {
  local container_name="hmpanel-nginx"
  local is_recheck="${1:-false}"
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

  if [[ "$status" == "restarting" || "$status" != "running" ]]; then
    stream_progress "Nginx container failed to start (Status: $status)."
    if [[ "$is_recheck" == "true" ]]; then
      stream_progress "Nginx failed to start even in HTTP-only mode. Manual intervention required."
      return 1
    fi
    stream_progress "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx container startup failure"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  stream_progress "Verifying Nginx configuration and endpoints..."
  local config_valid=false
  if docker exec "$container_name" nginx -t >/dev/null 2>&1; then
    config_valid=true
  fi

  local vdomain
  vdomain=$(panel_domain)
  local curl_success=false
  for i in {1..15}; do
    local code_https code_http
    code_https=$(curl -s -o /dev/null -w "%{http_code}" -k --max-time 4 --resolve "${vdomain}:$(panel_https_port):127.0.0.1" "https://${vdomain}:$(panel_https_port)/api/health" || echo "000")
    code_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 --resolve "${vdomain}:$(panel_http_port):127.0.0.1" "http://${vdomain}:$(panel_http_port)/api/health" || echo "000")
    
    if [[ "$code_https" == "200" || "$code_http" == "200" ]]; then
      curl_success=true
      break
    fi
    sleep 2
  done

  if [[ "$config_valid" == true ]]; then
    if [[ "$curl_success" == false ]]; then
      stream_progress "Nginx is running with valid config, but API health is unreachable (Code: HTTPS $code_https / HTTP $code_http). Preserving SSL."
    else
      stream_progress "Nginx is running and endpoints are healthy"
    fi
    return 0
  fi

  if [[ "$curl_success" == false && "$config_valid" == false ]]; then
    stream_progress "Nginx config test failed and API is unreachable."
    if [[ "$is_recheck" == "true" ]]; then
      stream_progress "Endpoints unreachable even in HTTP-only mode. Manual intervention required."
      return 1
    fi
    stream_progress "Automatically falling back to HTTP..."
    ssl_fallback_to_http "Nginx endpoints unreachable with SSL configuration"
    sleep 3
    verify_nginx_status "true"
    return $?
  fi

  stream_progress "Nginx is running and endpoints are healthy"
  return 0
}

ssl_fallback_to_http() {
  local reason="${1:-Unknown SSL failure}"
  echo -e "${RED}✘ SSL failed: ${reason}${NC}" >&2

  # Keep the certificates (re-issuing hits CA rate limits) but stop nginx from
  # loading them, including on any later restart.
  ssl_mark_disabled
  ssl_set_env_state http

  local domain
  domain=$(panel_domain)
  if ! docker exec \
    -e APP_PORT="${APP_PORT:-3000}" \
    -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
    -e PANEL_DOMAIN="$domain" \
    hmpanel-nginx sh -c "
      sh /etc/nginx/generate_config.sh && nginx -t && nginx -s reload
    " >/dev/null 2>&1; then
    # Container is dead or restart-looping: recreating regenerates HTTP config.
    recreate_nginx
  fi
}

ssl_issue() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Issue / Renew SSL ---${NC}\n"
  fi

  stream_progress "Verifying system dependencies..."
  local missing_deps=()
  for dep in git curl socat; do
    if ! command -v "$dep" &>/dev/null; then
      missing_deps+=("$dep")
    fi
  done

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      local deps_json=""
      for dep in "${missing_deps[@]}"; do
        if [[ -n "$deps_json" ]]; then deps_json+=","; fi
        deps_json+="\"$dep\""
      done
      output_json false "MISSING_DEPENDENCIES" "\"missing\":[$deps_json],\"reason\":\"Missing system packages: ${missing_deps[*]}. Install them with: apt-get install -y ${missing_deps[*]}\""
      exit 40
    else
      echo -e "${RED}✗ Error: Missing required system dependencies: ${missing_deps[*]}${NC}" >&2
      exit 1
    fi
  fi

  local override_domain="${PANEL_DOMAIN:-}"
  local override_email="${ADMIN_EMAIL:-}"
  source "${INSTALL_DIR}/.env"
  if [[ -n "$override_domain" ]]; then PANEL_DOMAIN="$override_domain"; fi
  if [[ -n "$override_email" ]]; then ADMIN_EMAIL="$override_email"; fi

  if [[ -z "${PANEL_DOMAIN:-}" || "$PANEL_DOMAIN" == "localhost" || "$PANEL_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "INVALID_DOMAIN" "\"reason\":\"A real domain name is required — an IP address or localhost cannot get a certificate.\""
      exit 30
    else
      echo -e "${YELLOW}⚠ IP address or localhost detected (${PANEL_DOMAIN:-None}). Skipping SSL workflow entirely.${NC}"
      exit 1
    fi
  fi

  stream_progress "Checking DNS..."
  if ! verify_dns "$PANEL_DOMAIN"; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "DNS_ERROR" "\"domain\":\"$PANEL_DOMAIN\",\"reason\":\"${PANEL_DOMAIN} does not resolve. Add an A record pointing to this server and try again — nothing was changed.\""
      exit 10
    else
      echo -e "${RED}✘ DNS verification failed for $PANEL_DOMAIN${NC}" >&2
      exit 1
    fi
  fi
  
  stream_progress "Checking Port..."
  # Our own nginx holding :80 is exactly what the webroot challenge needs, so it
  # must not be treated as a conflict. The strict check only matters when nginx
  # is down and a standalone challenge is the only option.
  # When the panel is published on another HTTP port, nginx cannot answer the
  # CA (HTTP-01 always connects to :80), so acme.sh must listen on :80 itself.
  local panel_hp webroot_ok=true
  panel_hp=$(panel_http_port)
  local nginx_running
  nginx_running=$(docker inspect -f '{{.State.Running}}' hmpanel-nginx 2>/dev/null || echo "false")
  if [[ "$panel_hp" != "80" ]]; then
    webroot_ok=false
    stream_progress "Panel HTTP port is ${panel_hp}; validation needs port 80 — using standalone challenge (panel stays online)."
    if port_listening 80; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json false "PORT_BUSY" "\"reason\":\"The panel runs on HTTP port ${panel_hp}, so certificate validation needs port 80 to be free, but another process is listening on it. Free port 80 or move the panel back to HTTP port 80.\",\"httpPort\":${panel_hp}"
        exit 11
      else
        echo -e "${RED}✘ Port 80 must be free for certificate validation (panel uses HTTP port ${panel_hp})${NC}" >&2
        exit 1
      fi
    fi
  elif [[ "$nginx_running" == "true" ]]; then
    stream_progress "Port 80 is served by hmpanel-nginx — using webroot challenge."
  elif ! verify_port_80; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "PORT_BUSY" "\"reason\":\"Port 80 is held by another process and Nginx is not running, so the ACME challenge cannot be answered.\""
      exit 11
    else
      echo -e "${RED}✘ Port 80 is occupied${NC}" >&2
      exit 1
    fi
  fi

  stream_progress "Preparing environment..."

  local cert_obtained=false
  local provider="none"
  local email="${ADMIN_EMAIL:-admin@$PANEL_DOMAIN}"
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  local ACME_WEBROOT="${INSTALL_DIR}/nginx/acme"
  local log_dir="${INSTALL_DIR}/logs/ssl"
  mkdir -p "$SSL_DIR" "${ACME_WEBROOT}/.well-known/acme-challenge" "$log_dir"
  local acme_log="${log_dir}/issue-${PANEL_DOMAIN}.log"
  : > "$acme_log"
  local first_hint="" hint=""

  # Webroot challenges are served by the running nginx (both templates expose
  # /.well-known/acme-challenge/ on the default port-80 server), so the panel
  # stays online for the whole issuance.
  docker start hmpanel-nginx >/dev/null 2>&1 || true

  # A CA attempt that cannot succeed costs minutes per CA, so prove the domain
  # reaches this nginx first and fail fast on the common "A record points
  # elsewhere" case.
  local reachable=false
  [[ "$webroot_ok" == true ]] && stream_progress "Checking that ${PANEL_DOMAIN} reaches this server on port 80..."
  if [[ "$webroot_ok" == true ]] && ssl_http01_selftest "$PANEL_DOMAIN"; then
    reachable=true
    stream_progress "http://${PANEL_DOMAIN}/.well-known/acme-challenge/ is reachable."
  else
    local public_ip resolved_ips
    public_ip=$(ssl_public_ipv4)
    resolved_ips=$(ssl_resolve_a "$PANEL_DOMAIN")
    if [[ -n "$public_ip" && -n "$resolved_ips" && " ${resolved_ips} " != *" ${public_ip} "* ]]; then
      local mismatch_reason="${PANEL_DOMAIN} points to ${resolved_ips} but this server is ${public_ip}. Point the A record to ${public_ip} (on Cloudflare use DNS only, grey cloud) and try again. Nothing was changed."
      ssl_restore_nginx_if_stopped
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json false "DNS_MISMATCH" "\"domain\":\"$PANEL_DOMAIN\",\"resolvedIp\":\"${resolved_ips}\",\"serverIp\":\"${public_ip}\",\"reason\":\"${mismatch_reason}\""
        exit 14
      fi
      echo -e "${RED}✘ ${mismatch_reason}${NC}" >&2
      exit 1
    fi
    [[ "$webroot_ok" == true ]] && stream_progress "Could not confirm reachability from this server (NAT or firewall may block self-checks) — trying anyway."
  fi

  local aaaa=""
  if command -v dig &>/dev/null; then
    aaaa=$(dig +short AAAA "$PANEL_DOMAIN" 2>/dev/null | grep ':' | head -n1 || true)
  fi
  if [[ -n "$aaaa" ]]; then
    stream_progress "Note: ${PANEL_DOMAIN} also has an IPv6 record (${aaaa}). The CA prefers IPv6, so it must point to this server too."
  fi

  local acme_bin
  acme_bin=$(find_acme_bin)

  # ACME (Let's Encrypt / ZeroSSL)
  if [[ -z "$acme_bin" ]] && command -v git &>/dev/null && command -v curl &>/dev/null && command -v socat &>/dev/null; then
    stream_progress "Installing acme.sh..."
    rm -rf /tmp/acme.sh
    if run_timeout 45 git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1 \
      || run_timeout 45 git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1; then
      # --nocron: renewals run through `hm ssl renew` (daily from the panel),
      # which only renews the current panel and custom domains.
      (
        cd /tmp/acme.sh
        ./acme.sh --install --home "$ACME_HOME" --nocron --accountemail "$email" >>"$acme_log" 2>&1
      ) || true
      rm -rf /tmp/acme.sh
      acme_bin=$(find_acme_bin)
    else
      stream_progress "acme.sh download failed, proceeding to fallback..."
    fi
  fi

  # ── Attempt 1: acme.sh webroot (nginx keeps serving) ───────────────
  local ca
  if [[ -n "$acme_bin" && "$webroot_ok" == true ]]; then
    for ca in "letsencrypt" "zerossl"; do
      [[ "$cert_obtained" == true ]] && break
      stream_progress "Requesting a certificate from ${ca} (webroot) — panel stays online..."
      if acme_issue_and_install "$acme_bin" "$ca" "$email" "$acme_log" --webroot "$ACME_WEBROOT"; then
        cert_obtained=true
        provider="$ca"
        stream_progress "Certificate issued successfully via $ca (webroot)"
      else
        hint=$(ssl_log_hint "$acme_log")
        [[ -z "$first_hint" ]] && first_hint="$hint"
        stream_progress "${ca} did not issue a certificate${hint:+: ${hint}}"
      fi
    done
  fi

  # ── Attempt 2: certbot webroot (nginx keeps serving) ───────────────
  if [[ "$cert_obtained" == false && "$webroot_ok" == true ]]; then
    stream_progress "Trying Certbot webroot..."
    local certbot_exit=1
    if command -v certbot &>/dev/null; then
      if run_timeout 120 certbot certonly --webroot -w "$ACME_WEBROOT" --non-interactive --agree-tos \
        -m "$email" -d "$PANEL_DOMAIN" --keep-until-expiring >>"$acme_log" 2>&1; then
        certbot_exit=0
      fi
    else
      # No -p 80:80 here: the challenge is written into the shared webroot.
      if run_timeout 180 docker run --rm \
        -v "${ACME_WEBROOT}:/var/www/acme" \
        -v "${SSL_DIR}:/etc/letsencrypt" \
        certbot/certbot certonly --webroot -w /var/www/acme --non-interactive --agree-tos \
        -m "$email" -d "$PANEL_DOMAIN" --keep-until-expiring >>"$acme_log" 2>&1; then
        certbot_exit=0
      fi
    fi

    if [[ $certbot_exit -eq 0 ]]; then
      local live_dir
      for live_dir in "/etc/letsencrypt/live/${PANEL_DOMAIN}" "${SSL_DIR}/live/${PANEL_DOMAIN}"; do
        if [[ -f "${live_dir}/privkey.pem" && -f "${live_dir}/fullchain.pem" ]]; then
          cp -fL "${live_dir}/privkey.pem" "${SSL_DIR}/privkey.pem"
          cp -fL "${live_dir}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
          break
        fi
      done
      if cert_valid_for_domain "${SSL_DIR}/fullchain.pem" "$PANEL_DOMAIN"; then
        cert_obtained=true
        provider="certbot"
        stream_progress "Certificate issued successfully via Certbot (webroot)"
      else
        stream_progress "Certbot reported success but cert files are missing..."
      fi
    else
      hint=$(ssl_log_hint "$acme_log")
      [[ -z "$first_hint" ]] && first_hint="$hint"
      stream_progress "Certbot webroot failed or timed out..."
    fi
  fi

  # ── Attempt 3: standalone (last resort — nginx pauses briefly) ─────
  # Only useful when nginx itself could not serve the challenge; if the
  # self-check passed, the failure is external and pausing the panel won't help.
  if [[ "$cert_obtained" == false && "$reachable" == false && -n "$acme_bin" ]]; then
    # nginx only holds host :80 when the panel is published there.
    local pause_nginx=false
    [[ "$webroot_ok" == true ]] && pause_nginx=true
    if [[ "$pause_nginx" == true ]]; then
      stream_progress "Webroot unreachable — trying standalone (panel pauses ~1 min)..."
      NGINX_STOPPED_FOR_SSL=1
      docker stop hmpanel-nginx >/dev/null 2>&1 || true
    else
      stream_progress "Requesting a certificate with a temporary listener on port 80..."
    fi
    for ca in "letsencrypt" "zerossl"; do
      [[ "$cert_obtained" == true ]] && break
      if ACME_ISSUE_TIMEOUT=90 acme_issue_and_install "$acme_bin" "$ca" "$email" "$acme_log" --standalone; then
        cert_obtained=true
        provider="$ca"
        stream_progress "Certificate issued successfully via $ca (standalone)"
      else
        hint=$(ssl_log_hint "$acme_log")
        [[ -z "$first_hint" ]] && first_hint="$hint"
      fi
    done
    if [[ "$pause_nginx" == true ]]; then
      docker start hmpanel-nginx >/dev/null 2>&1 || true
      NGINX_STOPPED_FOR_SSL=0
      sleep 3
    fi
  fi

  if [[ "$cert_obtained" != true ]]; then
    # Nothing was changed: .env still points at the previous domain and the
    # previous config is untouched, so the panel keeps working as before.
    ssl_restore_nginx_if_stopped
    hint="${first_hint:-$(ssl_log_hint "$acme_log")}"
    local fail_reason="Could not get a certificate for ${PANEL_DOMAIN}. Check that its A record points to this server and that port 80 is reachable from the internet. The panel was left on the previous domain."
    if [[ -n "$hint" ]]; then
      fail_reason+=" CA response: ${hint}"
    fi
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "ACME_FAILED" "\"domain\":\"$PANEL_DOMAIN\",\"reason\":\"${fail_reason}\",\"logFile\":\"${acme_log}\""
      exit 12
    fi
    echo -e "${RED}✘ Certificate issuance failed. Panel left on the previous domain.${NC}"
    [[ -n "$hint" ]] && echo -e "${YELLOW}  CA response: ${hint}${NC}"
    echo -e "  Full log: ${acme_log}"
    exit 1
  fi

  ssl_clear_disabled
  update_env "SSL_PROVIDER" "$provider"
  update_env "DOMAIN" "$PANEL_DOMAIN"
  update_env "PANEL_DOMAIN" "$PANEL_DOMAIN"

  # Recreate (not reload) so the container's baked PANEL_DOMAIN matches .env and
  # survives future restarts/reboots.
  stream_progress "Applying domain ${PANEL_DOMAIN} to Nginx..."
  recreate_nginx

  stream_progress "Waiting for the panel to answer on https://${PANEL_DOMAIN}..."
  if wait_for_nginx_health "$PANEL_DOMAIN" 20 https; then
    ssl_set_env_state https
    stream_progress "Panel is reachable on https://${PANEL_DOMAIN}."
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      stream_progress "Completed."
      output_json true "SSL_ISSUED" "\"provider\":\"$provider\",\"domain\":\"$PANEL_DOMAIN\",\"https\":true"
      exit 0
    fi
    verify_nginx_status
    pause
    return
  fi

  # Cert is fine but nginx will not serve it — never leave the panel dark.
  stream_progress "Panel did not answer with the new certificate — reverting to HTTP so it stays reachable."
  ssl_fallback_to_http "Nginx did not become healthy after issuing the certificate"
  recreate_nginx
  wait_for_nginx_health "$PANEL_DOMAIN" 10 || true

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json false "NGINX_UNHEALTHY_AFTER_ISSUE" "\"domain\":\"$PANEL_DOMAIN\",\"reason\":\"The certificate was issued but Nginx would not serve it, so the panel was reverted to HTTP and is still reachable. Run: hm ssl repair\""
    exit 13
  fi
  echo -e "${RED}✘ Nginx could not serve the new certificate. Reverted to HTTP.${NC}"
  exit 1
}

ssl_selfsigned() {
  acquire_ssl_lock
  local domain="${1:-localhost}"
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Generating Self-Signed SSL ---${NC}\n"
  fi
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl"
  mkdir -p "$SSL_DIR"

  # Generated on the host — no need to free port 80, so nginx keeps serving.
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/privkey.pem" \
    -out "${SSL_DIR}/fullchain.pem" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=${domain}" >/dev/null 2>&1 || true

  if [[ ! -f "${SSL_DIR}/fullchain.pem" ]]; then
    docker run --rm -v "${SSL_DIR}:/ssl" alpine sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -subj '/C=US/ST=State/L=City/O=Organization/CN=${domain}'" >/dev/null 2>&1 || true
  fi

  if [[ ! -f "${SSL_DIR}/fullchain.pem" || ! -f "${SSL_DIR}/privkey.pem" ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "SELFSIGNED_FAILED" "\"domain\":\"$domain\""
      exit 12
    fi
    echo -e "${RED}✘ Could not generate a self-signed certificate.${NC}"
    exit 1
  fi

  ssl_clear_disabled
  update_env "SSL_PROVIDER" "self-signed"
  # Only adopt the domain when one was actually supplied — the default
  # "localhost" must never overwrite a configured domain.
  if [[ -n "${1:-}" && "$domain" != "localhost" ]]; then
    update_env "DOMAIN" "$domain"
    update_env "PANEL_DOMAIN" "$domain"
  fi
  recreate_nginx

  if ! wait_for_nginx_health "$domain" 15 https; then
    ssl_fallback_to_http "Nginx did not become healthy with the self-signed certificate"
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "NGINX_UNHEALTHY_AFTER_ISSUE" "\"domain\":\"$domain\""
      exit 13
    fi
    echo -e "${RED}✘ Nginx unhealthy. Reverted to HTTP.${NC}"
    exit 1
  fi
  ssl_set_env_state https

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json true "SSL_SELFSIGNED" "\"domain\":\"$domain\",\"https\":true"
    exit 0
  else
    verify_nginx_status
  fi
  pause
}

ssl_transactional() {
  acquire_ssl_lock
  local action="$1"
  stream_progress "Initiating SSL workflow..."
  
  local issue_code=0
  eval "$action" || issue_code=$?

  if [[ $issue_code -eq 0 ]]; then
    stream_progress "Certificate issued successfully."
    stream_progress "Reloading Nginx..."
    reload_nginx
    
    if verify_nginx_status "true"; then
      stream_progress "Completed."
      exit 0
    else
      stream_progress "Nginx verification failed."
      exit 1
    fi
  else
    stream_progress "SSL workflow action failed."
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────
# Verification Engine
# ─────────────────────────────────────────────────────────────────

VERIFY_ENGINE_RESULTS="[]"
VERIFY_ENGINE_SUCCESS="true"
VERIFY_LOG_FILE=""

init_verify_engine() {
  VERIFY_ENGINE_RESULTS="[]"
  VERIFY_ENGINE_SUCCESS="true"
  if [[ "$DEBUG_MODE" == "true" ]]; then
    mkdir -p "${INSTALL_DIR}/logs/ssl"
    VERIFY_LOG_FILE="${INSTALL_DIR}/logs/ssl/ssl_verify_$(date +%Y-%m-%d_%H-%M-%S).log"
    # Rotate logs, keep last 10
    ls -1t "${INSTALL_DIR}/logs/ssl/"*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
  fi
}

append_verify_result() {
  local step="$1"
  local status="$2"
  local duration="$3"
  local message="$4"
  local details="$5"
  
  local step_json="{\"operation_id\": \"$OPERATION_ID\", \"step\": \"$step\", \"status\": \"$status\", \"durationMs\": $duration, \"message\": \"$message\", \"details\": $details}"
  
  if [[ "$VERIFY_ENGINE_RESULTS" == "[]" ]]; then
    VERIFY_ENGINE_RESULTS="[ $step_json ]"
  else
    VERIFY_ENGINE_RESULTS="${VERIFY_ENGINE_RESULTS%\]}, $step_json ]"
  fi
}

run_verify_wait() {
  local step_name="$1"
  local check_func="$2"
  local max_timeout_sec="${3:-60}"
  local retry_interval_sec="${4:-1}"
  
  local start_time=$(date +%s%3N 2>/dev/null || date +%s000)
  local status="FAIL"
  local message=""
  local details="{}"
  
  VERIFY_STEP_MESSAGE=""
  VERIFY_STEP_DETAILS="{}"
  
  local start_s=$(date +%s)
  local end_time=$(( start_s + max_timeout_sec ))
  
  local passed=false
  while [[ $(date +%s) -lt $end_time ]]; do
    if eval "$check_func"; then
      passed=true
      break
    fi
    sleep "$retry_interval_sec"
  done
  
  local end_time_ms=$(date +%s%3N 2>/dev/null || date +%s000)
  local duration=$(( end_time_ms - start_time ))
  
  if [[ "$passed" == "true" ]]; then
    status="PASS"
    message="${VERIFY_STEP_MESSAGE:-Passed}"
  else
    status="FAIL"
    VERIFY_ENGINE_SUCCESS="false"
    message="${VERIFY_STEP_MESSAGE:-Timeout exceeded ($max_timeout_sec s)}"
  fi
  
  details="${VERIFY_STEP_DETAILS:-{}}"
  
  if [[ -n "$VERIFY_LOG_FILE" ]]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WAIT_STEP=$step_name STATUS=$status DURATION=${duration}ms MSG=$message" >> "$VERIFY_LOG_FILE"
    echo "DETAILS: $details" >> "$VERIFY_LOG_FILE"
  fi
  
  append_verify_result "$step_name" "$status" "$duration" "$message" "$details"
  
  if [[ "$passed" == "true" ]]; then return 0; else return 1; fi
}

run_verify_step() {
  local step_name="$1"
  local check_func="$2"
  
  local start_time=$(date +%s%3N 2>/dev/null || date +%s000)
  local status="FAIL"
  local message=""
  local details="{}"
  
  VERIFY_STEP_MESSAGE=""
  VERIFY_STEP_DETAILS="{}"
  
  local passed=false
  if eval "$check_func"; then
    passed=true
  fi
  
  local end_time_ms=$(date +%s%3N 2>/dev/null || date +%s000)
  local duration=$(( end_time_ms - start_time ))
  
  if [[ "$passed" == "true" ]]; then
    status="PASS"
    message="${VERIFY_STEP_MESSAGE:-Passed}"
  else
    status="FAIL"
    VERIFY_ENGINE_SUCCESS="false"
    message="${VERIFY_STEP_MESSAGE:-Check failed}"
  fi
  
  details="${VERIFY_STEP_DETAILS:-{}}"
  
  if [[ -n "$VERIFY_LOG_FILE" ]]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] STEP=$step_name STATUS=$status DURATION=${duration}ms MSG=$message" >> "$VERIFY_LOG_FILE"
    echo "DETAILS: $details" >> "$VERIFY_LOG_FILE"
  fi
  
  append_verify_result "$step_name" "$status" "$duration" "$message" "$details"
  
  if [[ "$passed" == "true" ]]; then return 0; else return 1; fi
}

clean_json_val() {
  local input="$1"
  local truncated
  truncated=$(printf "%s" "$input" | cut -c 1-180)
  local clean
  clean=$(printf "%s" "$truncated" | sed 's/<[^>]*>//g' | tr -d '\r' | tr '\n' ' ')
  local escaped
  escaped=$(printf "%s" "$clean" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf "%s" "$escaped" | sed 's/\\*$//'
}

# ----------------- Verification Modules -----------------
# verify_dns() is defined once near the top of this script (used by SSL + doctor).

verify_nginx() {
  local out
  if out=$(docker exec hmpanel-nginx nginx -t 2>&1); then
    VERIFY_STEP_MESSAGE="Nginx config test passed"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_nginx] $out" >> "$VERIFY_LOG_FILE"; fi
    return 0
  else
    VERIFY_STEP_MESSAGE="Nginx config test failed"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"error\": \"$esc\"}"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_nginx] $out" >> "$VERIFY_LOG_FILE"; fi
    return 1
  fi
}

verify_tcp() {
  local domain="$1"
  if timeout 2 bash -c "</dev/tcp/127.0.0.1/$(panel_https_port)" 2>/dev/null; then
    VERIFY_STEP_MESSAGE="Port 443 accepting connections locally"
    return 0
  else
    VERIFY_STEP_MESSAGE="Connection refused or timed out on 127.0.0.1:$(panel_https_port)"
    return 1
  fi
}

verify_https_respond() {
  local domain="$1"
  local out
  if out=$(curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "$domain:$(panel_https_port):127.0.0.1" "https://$domain:$(panel_https_port)" 2>/dev/null); then
    if [[ "$out" != "000" ]]; then
      VERIFY_STEP_MESSAGE="HTTPS responding (HTTP $out)"
      return 0
    fi
  fi
  VERIFY_STEP_MESSAGE="HTTPS not responding"
  return 1
}

verify_tls() {
  local domain="$1"
  local out
  out=$(curl -s -k -v -I --connect-timeout 5 --resolve "$domain:$(panel_https_port):127.0.0.1" "https://$domain:$(panel_https_port)" 2>&1)
  if echo "$out" | grep -q "SSL connection using"; then
    VERIFY_STEP_MESSAGE="TLS connection established"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then 
      echo "[verify_tls] $out" | grep -E "SSL connection|Server certificate" >> "$VERIFY_LOG_FILE"
      echo | openssl s_client -connect "127.0.0.1:$(panel_https_port)" -servername "${domain}" 2>/dev/null | openssl x509 -noout -subject -issuer -dates >> "$VERIFY_LOG_FILE"
    fi
    return 0
  else
    VERIFY_STEP_MESSAGE="TLS handshake failed"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"error\": \"$esc\"}"
    if [[ -n "$VERIFY_LOG_FILE" ]]; then echo "[verify_tls] ERROR: $out" >> "$VERIFY_LOG_FILE"; fi
    return 1
  fi
}

verify_http_redirect() {
  local domain="$1"
  local out
  out=$(curl -s -I -o /dev/null -w "%{http_code}" --connect-timeout 5 --resolve "$domain:$(panel_http_port):127.0.0.1" "http://$domain:$(panel_http_port)" 2>/dev/null || echo "000")
  if [[ "$out" == "301" || "$out" == "302" || "$out" == "308" ]]; then
    VERIFY_STEP_MESSAGE="HTTP to HTTPS redirect working"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="HTTP redirect failed (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

verify_backend() {
  local domain="$1"
  local out
  out=$(curl -s -k --connect-timeout 5 --resolve "$domain:$(panel_https_port):127.0.0.1" "https://$domain:$(panel_https_port)/api/health" 2>/dev/null || echo "FAIL")
  if [[ "$out" == *"status"* || "$out" == *"ok"* ]]; then
    VERIFY_STEP_MESSAGE="Backend healthy"
    VERIFY_STEP_DETAILS="{\"response\": \"ok\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Backend unreachable"
    local esc
    esc=$(clean_json_val "$out")
    VERIFY_STEP_DETAILS="{\"response\": \"$esc\"}"
    return 1
  fi
}

verify_frontend() {
  local domain="$1"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 --resolve "$domain:$(panel_https_port):127.0.0.1" "https://$domain:$(panel_https_port)" 2>/dev/null || echo "000")
  if [[ "$out" == "200" ]]; then
    VERIFY_STEP_MESSAGE="Frontend reachable"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Frontend returning HTTP $out"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

verify_subscription() {
  local domain="$1"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}" -k --connect-timeout 5 --resolve "$domain:$(panel_https_port):127.0.0.1" "https://$domain:$(panel_https_port)/sub/healthcheck" 2>/dev/null || echo "000")
  if [[ "$out" != "502" && "$out" != "000" ]]; then
    VERIFY_STEP_MESSAGE="Subscription endpoint reachable (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 0
  else
    VERIFY_STEP_MESSAGE="Subscription endpoint failed (HTTP $out)"
    VERIFY_STEP_DETAILS="{\"httpCode\": \"$out\"}"
    return 1
  fi
}

# ----------------- Orchestrator -----------------

verify_e2e_health() {
  local domain="$1"
  stream_progress "Running end-to-end verification for $domain..."
  
  init_verify_engine
  
  if run_verify_wait "NGINX_HEALTH" "verify_nginx" 30 1; then
    run_verify_step "DNS_RESOLUTION" "verify_dns '$domain'"
    
    if run_verify_wait "TCP_443" "verify_tcp '$domain'" 30 1; then
      if run_verify_wait "HTTPS_ENDPOINT" "verify_https_respond '$domain'" 30 1; then
        
        run_verify_step "TLS_HANDSHAKE" "verify_tls '$domain'"
        run_verify_step "HTTP_REDIRECT" "verify_http_redirect '$domain'"
        
        # Wait up to 60s for containers to fully boot and endpoints to respond properly
        run_verify_wait "BACKEND_API" "verify_backend '$domain'" 60 2
        run_verify_wait "FRONTEND_ACCESSIBILITY" "verify_frontend '$domain'" 60 2
        run_verify_wait "SUBSCRIPTION_ENDPOINT" "verify_subscription '$domain'" 60 2
        
      fi
    fi
  fi
  
  if [[ "$VERIFY_ENGINE_SUCCESS" == "true" ]]; then
    stream_progress "End-to-End Verification Passed!"
  else
    stream_progress "End-to-End Verification Failed!"
  fi
  
  echo "{\"success\": $VERIFY_ENGINE_SUCCESS, \"code\": \"VERIFICATION_RESULT\", \"details\": $VERIFY_ENGINE_RESULTS}"
}

ssl_enable() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Enable HTTPS ---${NC}\n"
  fi
  
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"

  # generate_config.sh silently stays on HTTP for an expired certificate, so
  # catch that here instead of reporting HTTPS as enabled.
  if [[ ! -f "$cert_file" || ! -f "${INSTALL_DIR}/nginx/ssl/privkey.pem" ]] \
    || ! openssl x509 -checkend 0 -noout -in "$cert_file" >/dev/null 2>&1; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "CERTIFICATE_MISSING" "\"reason\":\"No valid certificate is installed (missing or expired). Issue a new certificate first.\""
      exit 1
    else
      echo -e "${YELLOW}⚠ Certificate missing or expired. Automatically running SSL Issue workflow...${NC}"
      ssl_issue
      return
    fi
  fi

  if [[ "$JSON_OUTPUT" != "true" ]]; then echo "Enabling HTTPS..."; fi

  ssl_clear_disabled
  reload_nginx

  local domain
  domain=$(panel_domain)
  if ! wait_for_nginx_health "$domain" 10 https; then
    stream_progress "Panel unreachable with HTTPS — reverting to HTTP."
    ssl_fallback_to_http "Nginx did not become healthy after enabling HTTPS"
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "NGINX_UNHEALTHY" "\"domain\":\"$domain\",\"reason\":\"Nginx would not serve HTTPS, so the panel was kept on HTTP. Run: hm ssl repair\""
      exit 13
    fi
    echo -e "${RED}✘ Could not enable HTTPS. Reverted to HTTP.${NC}"
    pause
    return
  fi
  ssl_set_env_state https

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json true "HTTPS_ENABLED" "\"domain\":\"$domain\",\"https\":true"
    exit 0
  else
    verify_nginx_status
    pause
  fi
}

ssl_disable() {
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Disable HTTPS ---${NC}\n"
    echo -e "${YELLOW}⚠ Warning: This will force Nginx back to HTTP mode.${NC}"
    read -rp "Are you sure? [y/N]: " confirm
  else
    confirm="y"
  fi
  
  if [[ "${confirm,,}" == "y" ]]; then
    update_env "SSL_PROVIDER" "none"
    ssl_set_env_state http

    # Marker keeps HTTP mode after any nginx restart; certs are left on disk so
    # HTTPS can be switched back on without a new CA order.
    ssl_mark_disabled

    local domain
    domain=$(panel_domain)
    docker exec \
      -e APP_PORT="${APP_PORT:-3000}" \
      -e BACKEND_PORT="${BACKEND_PORT:-4000}" \
      -e PANEL_DOMAIN="$domain" \
      hmpanel-nginx sh -c "
        sh /etc/nginx/generate_config.sh && nginx -t && nginx -s reload
      " >/dev/null 2>&1 || recreate_nginx

    wait_for_nginx_health "$domain" 10 || true

    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "HTTPS_DISABLED" "\"domain\":\"$domain\",\"https\":false"
      exit 0
    else
      echo -e "${GREEN}✔ HTTPS Disabled (HTTP configuration applied).${NC}"
      verify_nginx_status "true"
    fi
  else
    echo "Cancelled."
  fi
  pause
}

# Renews every certificate this panel serves: the panel domain and the custom
# domains under nginx/ssl/domains/. Without "force" only certificates that are
# due are renewed, so the daily cron never spends the CA's weekly
# duplicate-certificate limit.
ssl_renew() {
  acquire_ssl_lock
  local force=false
  [[ "${1:-}" == "force" ]] && force=true
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Renew Existing Certificate ---${NC}\n"
  fi
  source "${INSTALL_DIR}/.env"
  local domain="${PANEL_DOMAIN:-${DOMAIN:-}}"
  local main_chain="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  local main_key="${INSTALL_DIR}/nginx/ssl/privkey.pem"
  local webroot="${INSTALL_DIR}/nginx/acme"
  local log_dir="${INSTALL_DIR}/logs/ssl"
  mkdir -p "$log_dir" "${webroot}/.well-known/acme-challenge"
  local log="${log_dir}/renew.log"
  : > "$log"

  local renewed=0 skipped=0 failed=0 main_managed=false
  local force_flag=""
  [[ "$force" == true ]] && force_flag="--force"

  local acme_bin
  acme_bin=$(find_acme_bin)
  if [[ -n "$acme_bin" ]]; then
    local conf d chain key ecc keylen rc
    for conf in "${ACME_HOME}"/*/*.conf; do
      [[ -f "$conf" ]] || continue
      d=$(acme_conf_value "$conf" Le_Domain)
      [[ -n "$d" && "$(basename "$conf")" == "${d}.conf" ]] || continue
      if [[ "$d" == "$domain" ]]; then
        chain="$main_chain"
        key="$main_key"
        main_managed=true
      else
        chain=$(acme_conf_value "$conf" Le_RealFullChainPath)
        key=$(acme_conf_value "$conf" Le_RealKeyPath)
        # Only custom-domain certs that are still deployed. Old panel domains
        # also point at nginx/ssl/fullchain.pem and must never overwrite it.
        [[ "$chain" == "${INSTALL_DIR}/nginx/ssl/domains/"* && -d "$(dirname "$chain")" ]] || continue
        [[ -n "$key" ]] || key="$(dirname "$chain")/privkey.pem"
      fi
      ecc=""
      keylen="2048"
      if [[ "$(basename "$(dirname "$conf")")" == *_ecc ]]; then
        ecc="--ecc"
        keylen="ec-256"
      fi

      stream_progress "Checking ${d}..."
      rc=0
      run_timeout 180 "$acme_bin" --home "$ACME_HOME" --renew -d "$d" $ecc $force_flag >>"$log" 2>&1 || rc=$?
      if [[ $rc -ne 0 && $rc -ne 2 ]]; then
        # Certificates first issued in standalone mode cannot renew while nginx
        # owns :80 — retry over the webroot nginx already serves.
        # When the panel is published off :80, nginx cannot answer the CA, so a
        # temporary standalone listener on the (free) host :80 is used instead.
        local challenge=(--webroot "$webroot")
        if [[ "$(panel_http_port)" != "80" ]]; then
          if port_listening 80; then
            challenge=()
            stream_progress "Renewal of ${d} failed and port 80 is busy (panel uses HTTP port $(panel_http_port))."
          else
            challenge=(--standalone)
          fi
        fi
        if [[ ${#challenge[@]} -gt 0 ]]; then
          stream_progress "Renewal of ${d} failed — retrying (${challenge[0]#--})..."
          rc=0
          run_timeout 180 "$acme_bin" --home "$ACME_HOME" --issue -d "$d" "${challenge[@]}" \
            --keylength "$keylen" $force_flag >>"$log" 2>&1 || rc=$?
        fi
      fi
      case $rc in
        0)
          "$acme_bin" --home "$ACME_HOME" --install-cert -d "$d" $ecc \
            --fullchain-file "$chain" --key-file "$key" >>"$log" 2>&1 || true
          if cert_valid_for_domain "$chain" "$d"; then
            renewed=$((renewed + 1))
            stream_progress "Renewed ${d}."
          else
            failed=$((failed + 1))
            stream_progress "Renewed ${d} but could not install the new files."
          fi
          ;;
        2)
          skipped=$((skipped + 1))
          stream_progress "${d} is not due for renewal yet."
          ;;
        *)
          failed=$((failed + 1))
          stream_progress "Could not renew ${d}."
          ;;
      esac
    done
  fi

  # Certificates issued through certbot (host binary or container). Renewed
  # files land in live/<domain>, so they must be copied to where nginx reads.
  if [[ "$main_managed" == false && -n "$domain" ]]; then
    local live=""
    if [[ -d "${INSTALL_DIR}/nginx/ssl/live/${domain}" ]]; then
      live="${INSTALL_DIR}/nginx/ssl/live/${domain}"
    elif [[ -d "/etc/letsencrypt/live/${domain}" ]]; then
      live="/etc/letsencrypt/live/${domain}"
    fi
    if [[ -n "$live" ]]; then
      main_managed=true
      local certbot_force="" certbot_ok=false
      [[ "$force" == true ]] && certbot_force="--force-renewal"
      stream_progress "Checking ${domain} (certbot)..."
      if [[ "$live" == /etc/letsencrypt/* ]] && command -v certbot &>/dev/null; then
        run_timeout 180 certbot renew --cert-name "$domain" $certbot_force >>"$log" 2>&1 && certbot_ok=true
      else
        run_timeout 240 docker run --rm \
          -v "${webroot}:/var/www/acme" \
          -v "${INSTALL_DIR}/nginx/ssl:/etc/letsencrypt" \
          certbot/certbot renew --cert-name "$domain" --webroot -w /var/www/acme $certbot_force \
          >>"$log" 2>&1 && certbot_ok=true
      fi
      if [[ "$certbot_ok" == true ]] && cert_valid_for_domain "${live}/fullchain.pem" "$domain"; then
        if cmp -s "${live}/fullchain.pem" "$main_chain" 2>/dev/null; then
          skipped=$((skipped + 1))
          stream_progress "${domain} is not due for renewal yet."
        else
          cp -fL "${live}/fullchain.pem" "$main_chain"
          cp -fL "${live}/privkey.pem" "$main_key"
          renewed=$((renewed + 1))
          stream_progress "Renewed ${domain}."
        fi
      else
        failed=$((failed + 1))
        stream_progress "Could not renew ${domain} with certbot."
      fi
    fi
  fi

  if (( renewed > 0 )); then
    reload_nginx
  fi

  local summary="\"renewed\":${renewed},\"skipped\":${skipped},\"failed\":${failed}"
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    if (( failed > 0 )); then
      local hint
      hint=$(ssl_log_hint "$log")
      output_json false "RENEW_FAILED" "${summary},\"reason\":\"Certificate renewal failed${hint:+: ${hint}}\",\"log\":\"$(json_escape_log_tail "$log")\""
      exit 12
    elif (( renewed > 0 )); then
      output_json true "RENEW_SUCCESS" "${summary},\"log\":\"$(json_escape_log_tail "$log")\""
      exit 0
    elif (( skipped > 0 )); then
      output_json true "RENEW_NOT_DUE" "${summary},\"log\":\"Certificates are valid and not due for renewal yet.\""
      exit 0
    elif [[ "$force" == true ]]; then
      output_json false "NOTHING_TO_RENEW" "${summary},\"reason\":\"No ACME certificate is managed for ${domain:-this panel}. Issue a certificate first.\""
      exit 30
    else
      output_json true "NOTHING_TO_RENEW" "${summary}"
      exit 0
    fi
  fi

  echo -e "Renewed: ${renewed}   Not due: ${skipped}   Failed: ${failed}"
  if (( failed > 0 )); then
    echo -e "${YELLOW}See ${log} for details.${NC}"
  fi
  verify_nginx_status
  pause
}

ssl_test_dns() {
  echo -e "${BOLD}--- Test Domain & DNS ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  local domain="${PANEL_DOMAIN:-localhost}"
  
  echo -e "Domain: ${CYAN}${domain}${NC}"
  
  local public_ip
  public_ip=$(curl -s https://api.ipify.org || curl -s https://icanhazip.com || echo "Unknown")
  echo -e "Public IP: ${CYAN}${public_ip}${NC}"

  if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "DNS A Record: ${CYAN}N/A (IP Address)${NC}"
  else
    local a_record
    a_record=$(dig +short "$domain" 2>/dev/null || host "$domain" | awk '/has address/ {print $4}' | head -n1)
    echo -e "DNS A Record: ${CYAN}${a_record:-Not Found}${NC}"
    if [[ "$a_record" == "$public_ip" && -n "$a_record" ]]; then
      echo -e "Match: ${GREEN}Yes${NC}"
    else
      echo -e "Match: ${RED}No Mismatch${NC}"
    fi
  fi

  echo ""
  verify_port_80
  
  echo "Checking if port 443 is available..."
  if command -v ss &>/dev/null && ss -tuln | grep -q ":$(panel_https_port) "; then
    echo -e "${YELLOW}⚠ Port 443 is occupied${NC}"
  else
    echo -e "${GREEN}✔ Port 443 is available${NC}"
  fi
  pause
}

ssl_repair() {
  # acquire_ssl_lock already reclaims a stale lock; a live one means another
  # SSL operation is writing the cert files right now.
  acquire_ssl_lock
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- Repair SSL ---${NC}\n"
    echo "Rebuilding configuration..."
  fi
  source "${INSTALL_DIR}/.env"
  local domain="${PANEL_DOMAIN:-${DOMAIN:-localhost}}"
  
  # 1. Rediscover installed certificates
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  local key_file="${INSTALL_DIR}/nginx/ssl/privkey.pem"
  local cert_exists=false
  if [[ -f "$cert_file" && -f "$key_file" ]]; then
    cert_exists=true
  fi

  # 2. Detect certificate provider
  local provider="none"
  if [[ "$cert_exists" == "true" ]]; then
    local issuer
    issuer=$(openssl x509 -issuer -noout -in "$cert_file" 2>/dev/null || echo "")
    if [[ "$issuer" == *"Let's Encrypt"* ]]; then
      provider="letsencrypt"
    elif [[ "$issuer" == *"ZeroSSL"* ]]; then
      provider="zerossl"
    elif [[ "$issuer" == *"localhost"* || "$issuer" == *"State"* ]]; then
      provider="self-signed"
    else
      provider="uploaded"
    fi
  fi
  update_env "SSL_PROVIDER" "$provider"

  # Repair means "serve HTTPS again if we can", so it clears an earlier HTTP
  # fallback. Going back to HTTP on purpose is what `hm ssl disable` is for.
  if [[ "$cert_exists" == "true" ]]; then
    ssl_clear_disabled
  fi

  # 3. Recreate so the container env matches .env (a reload would keep a stale
  #    PANEL_DOMAIN from the last time the container was created).
  recreate_nginx

  # 4. Verify, and drop to HTTP rather than leaving the panel unreachable.
  #    HTTPS is only reported when nginx actually answers on 443; an expired
  #    cert makes generate_config.sh fall back to HTTP on its own.
  local https_now="false"
  if [[ "$cert_exists" == "true" && ! -f "$SSL_DISABLED_MARKER" ]] \
    && openssl x509 -checkend 0 -noout -in "$cert_file" >/dev/null 2>&1 \
    && wait_for_nginx_health "$domain" 15 https; then
    https_now="true"
  elif ! wait_for_nginx_health "$domain" 15; then
    ssl_fallback_to_http "Nginx unhealthy during repair"
    recreate_nginx
    wait_for_nginx_health "$domain" 10 || true
  fi
  ssl_set_env_state "$([[ "$https_now" == "true" ]] && echo https || echo http)"

  if verify_nginx_status "true"; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "REPAIR_SUCCESS" "\"domain\":\"$domain\",\"https\":$https_now,\"details\":\"Nginx is running and configuration is valid.\""
      exit 0
    else
      echo -e "${GREEN}✔ SSL repaired successfully!${NC}"
    fi
  else
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "REPAIR_FAILED" "\"reason\":\"Nginx is not running or its configuration is invalid. Check: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs --tail 50 nginx\""
      exit 1
    else
      echo -e "${RED}✘ Repair failed. Nginx is not running or configuration is invalid.${NC}"
    fi
  fi
  pause
}

ssl_status() {
  echo -e "${BOLD}--- SSL Status ---${NC}\n"
  source "${INSTALL_DIR}/.env"
  
  local cert_file="${INSTALL_DIR}/nginx/ssl/fullchain.pem"
  local key_file="${INSTALL_DIR}/nginx/ssl/privkey.pem"
  local cert_exists=false
  if [[ -f "$cert_file" && -f "$key_file" ]]; then
    cert_exists=true
  fi

  local nginx_ssl=false
  if docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep -q "listen 443 ssl"; then
    nginx_ssl=true
  fi

  local nginx_server_name=""
  nginx_server_name=$(docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep "server_name" | grep -v "_" | awk '{print $2}' | tr -d ';' | head -n1)
  
  local is_corrupted=false
  # Consistency validation
  # (Having certificates exist but running HTTP is a valid disabled state, so only check the reverse)
  if [[ "$cert_exists" == "false" && "$nginx_ssl" == true ]]; then
    is_corrupted=true
  fi

  if [[ "$is_corrupted" == "true" ]]; then
    echo -e "${RED}${BOLD}Configuration State Corrupted${NC}"
    echo -e "${RED}The system SSL state is inconsistent. Please run Repair SSL to rebuild it.${NC}\n"
  fi

  echo -e "Desired State:    ${CYAN}${PANEL_PROTOCOL^^}${NC}"
  echo -e "Provider:         ${CYAN}${SSL_PROVIDER}${NC}"
  echo -e "Domain:           ${CYAN}${PANEL_DOMAIN}${NC}"
  
  if [[ "$cert_exists" == "true" ]]; then
    local end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
    local expiration_epoch=$(date -d "$end_date" +%s 2>/dev/null)
    local current_epoch=$(date +%s)
    if [[ -n "$expiration_epoch" ]]; then
      local days_left=$(( (expiration_epoch - current_epoch) / 86400 ))
      echo -e "Expiration:       ${CYAN}${end_date}${NC}"
      if [[ $days_left -lt 0 ]]; then
        echo -e "Cert Status:      ${RED}Expired ($((-days_left)) days ago)${NC}"
      else
        echo -e "Cert Status:      ${GREEN}Valid (${days_left} days left)${NC}"
      fi
    fi
    echo -e "Certificate Path: ${CYAN}${cert_file}${NC}"
  else
    echo -e "Cert Status:      ${RED}Missing${NC}"
  fi

  local nginx_status=$(docker inspect -f '{{.State.Status}}' hmpanel-nginx 2>/dev/null || echo "missing")
  if [[ "$nginx_status" == "running" ]]; then
    echo -e "Nginx Status:     ${GREEN}Running${NC}"
  else
    echo -e "Nginx Status:     ${RED}${nginx_status}${NC}"
  fi

  echo -e "\n--- Diagnostics ---"
  
  # DNS check
  local ip=""
  if [[ -n "${PANEL_DOMAIN:-}" && "${PANEL_DOMAIN}" != "localhost" ]]; then
    ip=$(dig +short "$PANEL_DOMAIN" 2>/dev/null | tail -n1)
    if [[ -n "$ip" ]]; then
      printf "%-22s %s\n" "DNS Resolution" "${GREEN}PASS${NC}"
      printf "%-22s %s\n" "Resolved IP" "${CYAN}${ip}${NC}"
    else
      printf "%-22s %s\n" "DNS Resolution" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "DNS Resolution" "${YELLOW}SKIP (localhost/IP)${NC}"
  fi

  # Expected Server IP
  local public_ip
  public_ip=$(curl -s --connect-timeout 2 https://api.ipify.org || echo "")
  if [[ -n "$public_ip" ]]; then
    printf "%-22s %s\n" "Expected Server IP" "${CYAN}${public_ip}${NC}"
  fi

  # HTTP/HTTPS Virtual Host
  if [[ "$nginx_status" == "running" ]]; then
    if docker exec hmpanel-nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep -q "listen 80"; then
      printf "%-22s %s\n" "HTTP Virtual Host" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "HTTP Virtual Host" "${RED}FAIL${NC}"
    fi

    if [[ "$nginx_ssl" == "true" ]]; then
      printf "%-22s %s\n" "HTTPS Virtual Host" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "HTTPS Virtual Host" "${RED}FAIL${NC}"
    fi

    if [[ -n "${PANEL_DOMAIN:-}" && ("$nginx_server_name" == "$PANEL_DOMAIN" || "$nginx_server_name" == "_") ]]; then
      printf "%-22s %s\n" "server_name" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "server_name" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "HTTP Virtual Host" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "HTTPS Virtual Host" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "server_name" "${RED}FAIL${NC}"
  fi

  # TCP 80 / 443
  if timeout 2 bash -c "</dev/tcp/127.0.0.1/$(panel_http_port)" 2>/dev/null; then
    printf "%-22s %s\n" "TCP 80" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "TCP 80" "${RED}FAIL${NC}"
  fi

  if timeout 2 bash -c "</dev/tcp/127.0.0.1/$(panel_https_port)" 2>/dev/null; then
    printf "%-22s %s\n" "TCP 443" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "TCP 443" "${RED}FAIL${NC}"
  fi

  # Cert Existence & Valid
  if [[ "$cert_exists" == "true" ]]; then
    printf "%-22s %s\n" "Certificate Exists" "${GREEN}PASS${NC}"
    local exp_epoch=$(date -d "$end_date" +%s 2>/dev/null)
    local cur_epoch=$(date +%s)
    if [[ -n "$exp_epoch" && $exp_epoch -gt $cur_epoch ]]; then
      printf "%-22s %s\n" "Certificate Valid" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Certificate Valid" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "Certificate Exists" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "Certificate Valid" "${RED}FAIL${NC}"
  fi

  # Nginx Config & Listening 443
  if [[ "$nginx_status" == "running" ]]; then
    if docker exec hmpanel-nginx nginx -t &>/dev/null; then
      printf "%-22s %s\n" "Nginx Config" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Nginx Config" "${RED}FAIL${NC}"
    fi

    if docker exec hmpanel-nginx netstat -tuln 2>/dev/null | grep -q ":443 "; then
      printf "%-22s %s\n" "Nginx Listening 443" "${GREEN}PASS${NC}"
    else
      printf "%-22s %s\n" "Nginx Listening 443" "${RED}FAIL${NC}"
    fi
  else
    printf "%-22s %s\n" "Nginx Config" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "Nginx Listening 443" "${RED}FAIL${NC}"
  fi

  # TLS Handshake & Certificate Loaded
  local tls_handshake=false
  if [[ "$nginx_status" == "running" && "$nginx_ssl" == "true" && -n "${PANEL_DOMAIN:-}" ]]; then
    if curl -s -k -v -I --connect-timeout 2 --resolve "${PANEL_DOMAIN}:$(panel_https_port):127.0.0.1" "https://${PANEL_DOMAIN}:$(panel_https_port)" 2>&1 | grep -q "SSL connection using"; then
      tls_handshake=true
    fi
  fi

  if [[ "$tls_handshake" == "true" ]]; then
    printf "%-22s %s\n" "Certificate Loaded" "${GREEN}PASS${NC}"
    printf "%-22s %s\n" "TLS Handshake" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Certificate Loaded" "${RED}FAIL${NC}"
    printf "%-22s %s\n" "TLS Handshake" "${RED}FAIL${NC}"
  fi

  # Health checks
  if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:$(panel_http_port)/api/health" | grep -q "200"; then
    printf "%-22s %s\n" "HTTP Health" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "HTTP Health" "${RED}FAIL${NC}"
  fi

  local https_health=false
  if [[ "$nginx_status" == "running" && "$nginx_ssl" == "true" && -n "${PANEL_DOMAIN:-}" ]]; then
    if curl -s -k -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "${PANEL_DOMAIN}:$(panel_https_port):127.0.0.1" "https://${PANEL_DOMAIN}:$(panel_https_port)/api/health" | grep -q "200"; then
      https_health=true
    fi
  fi

  if [[ "$https_health" == "true" ]]; then
    printf "%-22s %s\n" "HTTPS Health" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "HTTPS Health" "${RED}FAIL${NC}"
  fi

  if curl -s --connect-timeout 2 "http://panel-app:4000/health" &>/dev/null || curl -s --connect-timeout 2 "http://127.0.0.1:4000/health" &>/dev/null; then
    printf "%-22s %s\n" "Backend" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Backend" "${RED}FAIL${NC}"
  fi

  if curl -s --connect-timeout 2 "http://panel-app:3000" &>/dev/null || curl -s --connect-timeout 2 "http://127.0.0.1:3000" &>/dev/null; then
    printf "%-22s %s\n" "Frontend" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Frontend" "${RED}FAIL${NC}"
  fi

  # Redirect
  local redirect_ok=false
  if [[ -n "${PANEL_DOMAIN:-}" && "${PANEL_DOMAIN}" != "localhost" ]]; then
    local r_code
    r_code=$(curl -s -I -o /dev/null -w "%{http_code}" --connect-timeout 2 --resolve "${PANEL_DOMAIN}:$(panel_http_port):127.0.0.1" "http://${PANEL_DOMAIN}:$(panel_http_port)" || echo "000")
    if [[ "$r_code" == "301" || "$r_code" == "302" || "$r_code" == "308" ]]; then
      redirect_ok=true
    fi
  fi
  if [[ "$redirect_ok" == "true" ]]; then
    printf "%-22s %s\n" "Redirect" "${GREEN}PASS${NC}"
  else
    printf "%-22s %s\n" "Redirect" "${RED}FAIL${NC}"
  fi

  pause
}

# Terminal equivalent of the panel's "Change Domain" wizard, so the domain can
# still be moved when the UI is unreachable.
ssl_change_domain_interactive() {
  echo -e "${BOLD}--- Change Panel Domain ---${NC}\n"
  echo -e "  Current domain: ${CYAN}$(panel_domain)${NC}\n"

  local new_domain new_email confirm
  read -rp "  New domain (e.g. panel.example.com): " new_domain
  if [[ -z "$new_domain" || "$new_domain" != *.* ]]; then
    echo -e "${RED}✘ A fully qualified domain is required.${NC}"
    pause
    return
  fi
  read -rp "  Admin email for the certificate [admin@${new_domain}]: " new_email
  new_email="${new_email:-admin@${new_domain}}"

  echo ""
  echo -e "${YELLOW}⚠ The A record of ${new_domain} must already point to this server.${NC}"
  read -rp "  Continue? [y/N]: " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Cancelled."
    pause
    return
  fi

  export PANEL_DOMAIN="$new_domain"
  export ADMIN_EMAIL="$new_email"
  ssl_issue
}

cmd_ssl() {
  while true; do
    clear
    print_header
    echo -e "${BOLD}--- SSL Management ---${NC}\n"
    echo "  1) Issue / Renew SSL"
    echo "  2) Enable HTTPS"
    echo "  3) Disable HTTPS (HTTP Mode)"
    echo "  4) Renew Existing Certificate"
    echo "  5) Check SSL Status"
    echo "  6) Test Domain & DNS"
    echo "  7) Repair SSL"
    echo "  8) Change Panel Domain"
    echo "  0) Back to Main Menu"
    echo ""
    read -rp "  Choice: " choice
    echo ""
    
    case $choice in
      1) ssl_issue ;;
      2) ssl_enable ;;
      3) ssl_disable ;;
      4) ssl_renew force ;;
      5) ssl_status ;;
      6) ssl_test_dns ;;
      7) ssl_repair ;;
      8) ssl_change_domain_interactive ;;
      0) return ;;
      *) echo -e "${RED}Invalid option!${NC}"; sleep 1 ;;
    esac
  done
}

cmd_uninstall() {
  echo -e "${BOLD}--- Uninstall HMPanel ---${NC}\n"
  if [[ -f "${INSTALL_DIR}/uninstall.sh" ]]; then
    echo -e "${YELLOW}⚠ WARNING: You are about to uninstall the panel.${NC}"
    read -rp "Are you absolutely sure you want to proceed? [y/N]: " confirm
    if [[ "${confirm,,}" == "y" ]]; then
      bash "${INSTALL_DIR}/uninstall.sh"
      exit 0
    else
      echo "Uninstall cancelled."
      pause
    fi
  else
    echo -e "${RED}✘ uninstall.sh not found in ${INSTALL_DIR}${NC}"
    pause
  fi
}

cmd_cleanup() {
  echo -e "${BOLD}--- System Cleanup ---${NC}\n"
  echo "This will remove all unused Docker images to free up disk space."
  read -rp "Do you want to proceed? [y/N]: " confirm
  if [[ "${confirm,,}" == "y" ]]; then
    echo "Running cleanup..."
    docker system prune -a -f --volumes
    echo -e "${GREEN}✔ Cleanup completed.${NC}"
  else
    echo "Cleanup cancelled."
  fi
  pause
}

cmd_doctor() {
  if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BOLD}--- HMPanel Doctor ---${NC}\n"
  fi
  
  local docker_status="missing"
  if command -v docker &>/dev/null; then
    docker_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Docker"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Docker"; fi
  fi
  
  local compose_status="missing"
  if resolve_compose; then
    compose_status="installed"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Docker Compose ($(echo "${COMPOSE_BIN[*]}"))"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Docker Compose"; fi
  fi
  
  local pg_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-postgres 2>/dev/null)" == "running" ]]; then
    pg_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ PostgreSQL"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ PostgreSQL"; fi
  fi
  
  local redis_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-redis 2>/dev/null)" == "running" ]]; then
    redis_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Redis"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Redis"; fi
  fi
  
  local nginx_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-nginx 2>/dev/null)" == "running" ]]; then
    nginx_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Nginx"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Nginx"; fi
  fi
  
  local panel_status="missing"
  if [[ "$(docker inspect -f '{{.State.Status}}' hmpanel-panel 2>/dev/null)" == "running" ]]; then
    panel_status="running"
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✓ Backend"; fi
  else
    if [[ "$JSON_OUTPUT" != "true" ]]; then echo -e "✗ Backend"; fi
  fi
  
  local overall="healthy"
  if [[ "$docker_status" != "running" || "$pg_status" != "running" || "$redis_status" != "running" || "$nginx_status" != "running" || "$panel_status" != "running" ]]; then
    overall="unhealthy"
  fi
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    local json_body="\"docker\":\"$docker_status\",\"compose\":\"$compose_status\",\"postgres\":\"$pg_status\",\"redis\":\"$redis_status\",\"nginx\":\"$nginx_status\",\"backend\":\"$panel_status\",\"overall\":\"$overall\""
    output_json true "DOCTOR_REPORT" "$json_body"
    exit 0
  else
    echo -e "\nOverall: ${CYAN}${overall^^}${NC}"
    pause
  fi
}

cmd_version() {
  local app_ver="unknown"
  local schema_ver="unknown"
  
  if [[ -f "${INSTALL_DIR}/VERSION" ]]; then
    app_ver=$(tr -d '\r\n' < "${INSTALL_DIR}/VERSION")
  elif [[ -f "${INSTALL_DIR}/package.json" ]]; then
    app_ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)
    app_ver="${app_ver:-unknown}"
  fi
  if [[ -f "${INSTALL_DIR}/prisma/schema.prisma" ]]; then
    schema_ver="1" # Placeholder
  fi
  
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    local json_body="\"application\":\"$app_ver\",\"cli\":\"$app_ver\",\"installer\":\"$app_ver\",\"schema\":\"$schema_ver\",\"build\":\"2026-06-30\""
    output_json true "VERSION_REPORT" "$json_body"
    exit 0
  else
    echo -e "${BOLD}--- Version Info ---${NC}\n"
    echo -e "Application: $app_ver"
    echo -e "CLI:         $app_ver"
    echo -e "Installer:   $app_ver"
    pause
  fi
}

# ─────────────────────────────────────────────────────────────────
# Premium custom-domain vhosts (extra server_name + cert)
# ─────────────────────────────────────────────────────────────────

# Older installs may lack these files on disk (compose mounts them when present).
# Seed defaults so `hm ssl add-vhost` never fails with TEMPLATE_MISSING.
# Some broken installs accidentally created these paths as directories — replace them.
ssl_ensure_vhost_templates() {
  local nginx_dir="${INSTALL_DIR}/nginx"
  mkdir -p "$nginx_dir" "${nginx_dir}/conf.d" "${nginx_dir}/acme/.well-known/acme-challenge" "${nginx_dir}/ssl/domains"

  local tmpl_http="${nginx_dir}/vhost-domain.http.template"
  local tmpl_ssl="${nginx_dir}/vhost-domain.ssl.template"

  # Path must be a regular file. If it is a directory/symlink/etc, remove and reseed.
  if [[ -e "$tmpl_http" && ! -f "$tmpl_http" ]]; then
    stream_progress "Replacing non-file vhost-domain.http.template (was directory/other)..."
    rm -rf "$tmpl_http"
  fi
  if [[ -e "$tmpl_ssl" && ! -f "$tmpl_ssl" ]]; then
    stream_progress "Replacing non-file vhost-domain.ssl.template (was directory/other)..."
    rm -rf "$tmpl_ssl"
  fi

  if [[ ! -f "$tmpl_http" ]]; then
    stream_progress "Seeding missing vhost-domain.http.template..."
    cat > "$tmpl_http" <<'TMPL_HTTP'
# Extra HTTP server for a Premium custom domain (${VHOST_DOMAIN}) when SSL is not ready.
# Also used as a temporary ACME webroot vhost during `hm ssl add-vhost`.

server {
    listen 80;
    server_name ${VHOST_DOMAIN};

    client_max_body_size 2048M;

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /s/ {
        gzip off;
        proxy_set_header Accept-Encoding "";
        proxy_pass http://backend/s/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend/;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
TMPL_HTTP
  fi

  if [[ ! -f "$tmpl_ssl" ]]; then
    stream_progress "Seeding missing vhost-domain.ssl.template..."
    cat > "$tmpl_ssl" <<'TMPL_SSL'
# Extra HTTPS server for a Premium custom domain (${VHOST_DOMAIN}).
# Generated by `hm ssl add-vhost`. Same upstreams as the main panel.

server {
    listen 80;
    server_name ${VHOST_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$hm_https_suffix$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${VHOST_DOMAIN};
    error_page 497 =301 https://$host$hm_https_suffix$request_uri;

    ssl_certificate     /etc/nginx/ssl/domains/${VHOST_SAFE}/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/domains/${VHOST_SAFE}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 2048M;

    location /api/ {
        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    location /socket.io/ {
        proxy_pass http://backend/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /s/ {
        gzip off;
        proxy_set_header Accept-Encoding "";
        proxy_pass http://backend/s/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /sub/ {
        gzip off;
        proxy_set_header Accept-Encoding "";
        proxy_pass http://backend/sub/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/static/ {
        proxy_pass http://frontend/_next/static/;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://frontend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
TMPL_SSL
  fi
}

ssl_write_http_vhost() {
  local vhost_domain="$1"
  local safe_domain="$2"
  local conf_out="$3"
  ssl_ensure_vhost_templates
  local tmpl_http="${INSTALL_DIR}/nginx/vhost-domain.http.template"
  if [[ ! -f "$tmpl_http" ]]; then
    return 1
  fi
  if command -v envsubst &>/dev/null; then
    VHOST_DOMAIN="$vhost_domain" VHOST_SAFE="$safe_domain" \
      envsubst '$VHOST_DOMAIN $VHOST_SAFE' < "$tmpl_http" > "$conf_out"
  else
    # Domain names are DNS-safe (no sed metacharacters beyond . -)
    sed -e "s|\${VHOST_DOMAIN}|${vhost_domain}|g" \
        -e "s|\${VHOST_SAFE}|${safe_domain}|g" \
      "$tmpl_http" > "$conf_out"
  fi
}

ssl_write_ssl_vhost() {
  local vhost_domain="$1"
  local safe_domain="$2"
  local conf_out="$3"
  ssl_ensure_vhost_templates
  local tmpl_ssl="${INSTALL_DIR}/nginx/vhost-domain.ssl.template"
  if [[ ! -f "$tmpl_ssl" ]]; then
    return 1
  fi
  if command -v envsubst &>/dev/null; then
    VHOST_DOMAIN="$vhost_domain" VHOST_SAFE="$safe_domain" \
      envsubst '$VHOST_DOMAIN $VHOST_SAFE' < "$tmpl_ssl" > "$conf_out"
  else
    sed -e "s|\${VHOST_DOMAIN}|${vhost_domain}|g" \
        -e "s|\${VHOST_SAFE}|${safe_domain}|g" \
      "$tmpl_ssl" > "$conf_out"
  fi
}

ssl_add_vhost() {
  acquire_ssl_lock
  local vhost_domain="${1:-}"
  local mode_or_email="${2:-}"
  local manual_cert="${3:-}"
  local manual_key="${4:-}"

  if [[ -z "$vhost_domain" ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "INVALID_DOMAIN"; exit 30; fi
    echo "Usage: hm ssl add-vhost <domain> <email|selfsigned|manual|manual-b64> [cert] [key]"
    exit 1
  fi

  local safe_domain
  safe_domain=$(echo "$vhost_domain" | tr -c 'A-Za-z0-9.-' '_')
  local SSL_DIR="${INSTALL_DIR}/nginx/ssl/domains/${safe_domain}"
  local ACME_WEBROOT="${INSTALL_DIR}/nginx/acme"
  local CONF_DIR="${INSTALL_DIR}/nginx/conf.d"
  local conf_out="${CONF_DIR}/${safe_domain}.conf"
  mkdir -p "$SSL_DIR" "$CONF_DIR" "${ACME_WEBROOT}/.well-known/acme-challenge"
  ssl_ensure_vhost_templates

  stream_progress "Adding vhost for $vhost_domain..."
  ssl_ensure_vhost_templates

  if [[ "$mode_or_email" == "selfsigned" ]]; then
    stream_progress "Generating self-signed certificate..."
    if ! openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${SSL_DIR}/privkey.pem" \
      -out "${SSL_DIR}/fullchain.pem" \
      -subj "/CN=${vhost_domain}" >/dev/null 2>&1; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "OPENSSL_FAILED"; exit 32; fi
      echo "openssl failed"; exit 1
    fi
  elif [[ "$mode_or_email" == "manual" ]]; then
    if [[ ! -f "$manual_cert" || ! -f "$manual_key" ]]; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "MISSING_CERT"; exit 31; fi
      echo "Manual cert/key files required"; exit 1
    fi
    cp -f "$manual_cert" "${SSL_DIR}/fullchain.pem"
    cp -f "$manual_key" "${SSL_DIR}/privkey.pem"
  elif [[ "$mode_or_email" == "manual-b64" ]]; then
    if [[ -z "$manual_cert" || -z "$manual_key" ]]; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "MISSING_CERT"; exit 31; fi
      echo "manual-b64 requires base64 cert and key args"; exit 1
    fi
    if ! printf '%s' "$manual_cert" | base64 -d > "${SSL_DIR}/fullchain.pem" 2>/dev/null; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "INVALID_CERT_B64"; exit 31; fi
      echo "Invalid certificate base64"; exit 1
    fi
    if ! printf '%s' "$manual_key" | base64 -d > "${SSL_DIR}/privkey.pem" 2>/dev/null; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "INVALID_KEY_B64"; exit 31; fi
      echo "Invalid key base64"; exit 1
    fi
    chmod 600 "${SSL_DIR}/privkey.pem" 2>/dev/null || true
  else
    # Let's Encrypt / ZeroSSL via webroot (nginx stays up — avoids panel downtime)
    local missing_deps=()
    for dep in git curl socat; do
      if ! command -v "$dep" &>/dev/null; then
        missing_deps+=("$dep")
      fi
    done
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        local deps_json=""
        for dep in "${missing_deps[@]}"; do
          if [[ -n "$deps_json" ]]; then deps_json+=","; fi
          deps_json+="\"$dep\""
        done
        output_json false "MISSING_DEPENDENCIES" "\"missing\":[$deps_json]"
        exit 40
      fi
      echo "Missing dependencies: ${missing_deps[*]}"; exit 1
    fi

    if ! verify_dns "$vhost_domain"; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "DNS_ERROR"; exit 10; fi
      echo "DNS verification failed for $vhost_domain"; exit 1
    fi
    if ! verify_port_80; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "PORT_BUSY"; exit 11; fi
      echo "Port 80 busy"; exit 1
    fi

    # Temporary HTTP vhost so Host: matches and ACME challenges are served from webroot
    if ! ssl_write_http_vhost "$vhost_domain" "$safe_domain" "$conf_out"; then
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json false "TEMPLATE_MISSING" "\"path\":\"${INSTALL_DIR}/nginx/vhost-domain.http.template\""
        exit 34
      fi
      echo "Missing nginx HTTP vhost template"; exit 1
    fi
    # Ensure nginx is running and picks up the HTTP vhost (do NOT stop it for webroot)
    docker start hmpanel-nginx >/dev/null 2>&1 || true
    reload_nginx

    local cert_obtained=false
    local last_ssl_error=""
    local acme_log="/tmp/hm-ssl-vhost-${safe_domain}.log"
    : > "$acme_log"

    local acme_bin=""
    if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
      acme_bin="${INSTALL_DIR}/acme.sh/acme.sh"
    elif [[ -f "/root/.acme.sh/acme.sh" ]]; then
      acme_bin="/root/.acme.sh/acme.sh"
    elif [[ -f "$HOME/.acme.sh/acme.sh" ]]; then
      acme_bin="$HOME/.acme.sh/acme.sh"
    elif command -v acme.sh &>/dev/null; then
      acme_bin=$(command -v acme.sh)
    fi

    local email="${mode_or_email:-admin@$vhost_domain}"
    if [[ "$email" != *"@"* ]]; then
      email="admin@${vhost_domain}"
    fi

    if [[ -z "$acme_bin" ]]; then
      stream_progress "Installing acme.sh for custom domain..."
      rm -rf /tmp/acme.sh
      local clone_success=false
      if command -v timeout &>/dev/null; then
        if timeout 45 git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1; then
          clone_success=true
        elif timeout 45 git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1; then
          clone_success=true
        fi
      else
        if git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1; then
          clone_success=true
        elif git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh >>"$acme_log" 2>&1; then
          clone_success=true
        fi
      fi
      if [[ "$clone_success" == true ]]; then
        (
          cd /tmp/acme.sh
          ./acme.sh --install \
            --home "${INSTALL_DIR}/acme.sh" \
            --nocron \
            --accountemail "$email" >>"$acme_log" 2>&1
        ) || true
        rm -rf /tmp/acme.sh
        if [[ -f "${INSTALL_DIR}/acme.sh/acme.sh" ]]; then
          acme_bin="${INSTALL_DIR}/acme.sh/acme.sh"
        fi
      else
        stream_progress "acme.sh download failed, trying certbot fallback..."
        last_ssl_error="acme_install_failed"
      fi
    fi

    # Prefer webroot — panel stays reachable
    if [[ -n "$acme_bin" ]]; then
      "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --register-account -m "$email" >>"$acme_log" 2>&1 || true
      for ca in "letsencrypt" "zerossl"; do
        if [[ "$cert_obtained" == false ]]; then
          stream_progress "Trying acme.sh webroot ($ca) for $vhost_domain..."
          "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server "$ca" >>"$acme_log" 2>&1 || true
          local issue_success=false
          if command -v timeout &>/dev/null; then
            if timeout 120 "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$vhost_domain" \
              -w "$ACME_WEBROOT" --force >>"$acme_log" 2>&1; then
              issue_success=true
            fi
          else
            if "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$vhost_domain" \
              -w "$ACME_WEBROOT" --force >>"$acme_log" 2>&1; then
              issue_success=true
            fi
          fi
          if [[ "$issue_success" == true ]]; then
            "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$vhost_domain" \
              --fullchain-file "${SSL_DIR}/fullchain.pem" \
              --key-file "${SSL_DIR}/privkey.pem" >>"$acme_log" 2>&1 || true
            if [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
              cert_obtained=true
              stream_progress "Certificate issued via acme.sh webroot ($ca)"
            else
              last_ssl_error="acme_install_cert_missing"
              stream_progress "acme.sh issued but cert files missing"
            fi
          else
            last_ssl_error="acme_webroot_${ca}_failed"
            stream_progress "acme.sh webroot ($ca) failed for $vhost_domain"
          fi
        fi
      done
    fi

    if [[ "$cert_obtained" == false ]]; then
      stream_progress "Trying certbot webroot for $vhost_domain..."
      local certbot_exit=1
      if command -v certbot &>/dev/null; then
        if command -v timeout &>/dev/null; then
          if timeout 120 certbot certonly --webroot -w "$ACME_WEBROOT" --non-interactive --agree-tos \
            -m "$email" -d "$vhost_domain" >>"$acme_log" 2>&1; then
            certbot_exit=0
          fi
        else
          if certbot certonly --webroot -w "$ACME_WEBROOT" --non-interactive --agree-tos \
            -m "$email" -d "$vhost_domain" >>"$acme_log" 2>&1; then
            certbot_exit=0
          fi
        fi
      else
        # Docker certbot with shared webroot (nginx stays up — no -p 80:80)
        if command -v timeout &>/dev/null; then
          if timeout 180 docker run --rm \
            -v "${ACME_WEBROOT}:/var/www/acme" \
            -v "${SSL_DIR}:/etc/letsencrypt" \
            certbot/certbot certonly --webroot -w /var/www/acme --non-interactive --agree-tos \
            -m "$email" -d "$vhost_domain" >>"$acme_log" 2>&1; then
            certbot_exit=0
          fi
        else
          if docker run --rm \
            -v "${ACME_WEBROOT}:/var/www/acme" \
            -v "${SSL_DIR}:/etc/letsencrypt" \
            certbot/certbot certonly --webroot -w /var/www/acme --non-interactive --agree-tos \
            -m "$email" -d "$vhost_domain" >>"$acme_log" 2>&1; then
            certbot_exit=0
          fi
        fi
      fi

      if [[ $certbot_exit -eq 0 ]]; then
        local live="/etc/letsencrypt/live/${vhost_domain}"
        if [[ -f "${live}/fullchain.pem" ]]; then
          cp -f "${live}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
          cp -f "${live}/privkey.pem" "${SSL_DIR}/privkey.pem"
          cert_obtained=true
        elif [[ -f "${SSL_DIR}/live/${vhost_domain}/fullchain.pem" ]]; then
          cp -f "${SSL_DIR}/live/${vhost_domain}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
          cp -f "${SSL_DIR}/live/${vhost_domain}/privkey.pem" "${SSL_DIR}/privkey.pem"
          cert_obtained=true
        fi
        if [[ "$cert_obtained" == true ]]; then
          stream_progress "Certificate issued via certbot webroot"
        else
          last_ssl_error="certbot_webroot_cert_missing"
        fi
      else
        last_ssl_error="certbot_webroot_failed"
      fi
    fi

    # Last resort: standalone (briefly stops nginx). EXIT trap restores it if we die mid-way.
    if [[ "$cert_obtained" == false && -n "$acme_bin" ]]; then
      stream_progress "Webroot failed — trying standalone (nginx will pause briefly)..."
      NGINX_STOPPED_FOR_SSL=1
      docker stop hmpanel-nginx >/dev/null 2>&1 || true
      for ca in "letsencrypt" "zerossl"; do
        if [[ "$cert_obtained" == false ]]; then
          stream_progress "Trying acme.sh standalone ($ca) for $vhost_domain..."
          "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --set-default-ca --server "$ca" >>"$acme_log" 2>&1 || true
          local issue_success=false
          if command -v timeout &>/dev/null; then
            if timeout 90 "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$vhost_domain" \
              --standalone --force >>"$acme_log" 2>&1; then
              issue_success=true
            fi
          else
            if "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --issue -d "$vhost_domain" \
              --standalone --force >>"$acme_log" 2>&1; then
              issue_success=true
            fi
          fi
          if [[ "$issue_success" == true ]]; then
            "$acme_bin" --home "${INSTALL_DIR}/acme.sh" --install-cert -d "$vhost_domain" \
              --fullchain-file "${SSL_DIR}/fullchain.pem" \
              --key-file "${SSL_DIR}/privkey.pem" >>"$acme_log" 2>&1 || true
            if [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
              cert_obtained=true
              stream_progress "Certificate issued via acme.sh standalone ($ca)"
            else
              last_ssl_error="acme_standalone_cert_missing"
            fi
          else
            last_ssl_error="acme_standalone_${ca}_failed"
          fi
        fi
      done
      docker start hmpanel-nginx >/dev/null 2>&1 || true
      NGINX_STOPPED_FOR_SSL=0
    fi

    if [[ "$cert_obtained" == false ]]; then
      ssl_restore_nginx_if_stopped
      rm -f "$conf_out"
      reload_nginx
      local hint
      hint=$(tail -n 8 "$acme_log" 2>/dev/null | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-400)
      if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json false "SSL_ISSUE_FAILED" "\"domain\":\"$vhost_domain\",\"reason\":\"${last_ssl_error:-unknown}\",\"hint\":\"${hint}\""
        exit 20
      fi
      echo "Failed to issue certificate for $vhost_domain (${last_ssl_error:-unknown})"; exit 1
    fi
  fi

  if [[ ! -f "${SSL_DIR}/fullchain.pem" || ! -f "${SSL_DIR}/privkey.pem" ]]; then
    ssl_restore_nginx_if_stopped
    if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "CERTIFICATE_MISSING"; exit 33; fi
    echo "Certificate files missing after issue"; exit 1
  fi

  # Write HTTPS vhost (required — HTTP-only is not success)
  if ! ssl_write_ssl_vhost "$vhost_domain" "$safe_domain" "$conf_out"; then
    ssl_restore_nginx_if_stopped
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "TEMPLATE_MISSING" "\"path\":\"${INSTALL_DIR}/nginx/vhost-domain.ssl.template\""
      exit 34
    fi
    echo "Missing nginx SSL vhost template"; exit 1
  fi

  ssl_restore_nginx_if_stopped
  docker start hmpanel-nginx >/dev/null 2>&1 || true
  reload_nginx
  if ! docker exec hmpanel-nginx nginx -t >/dev/null 2>&1; then
    rm -f "$conf_out"
    docker exec hmpanel-nginx nginx -s reload >/dev/null 2>&1 || true
    if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "NGINX_CONFIG_INVALID"; exit 35; fi
    echo "nginx config test failed for $vhost_domain"; exit 1
  fi

  stream_progress "Vhost ready for $vhost_domain"
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json true "OK" "\"domain\":\"$vhost_domain\",\"cert\":\"${SSL_DIR}/fullchain.pem\",\"key\":\"${SSL_DIR}/privkey.pem\""
  fi
}

ssl_remove_vhost() {
  acquire_ssl_lock
  local vhost_domain="${1:-}"
  if [[ -z "$vhost_domain" ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "INVALID_DOMAIN"; exit 30; fi
    exit 1
  fi
  local safe_domain
  safe_domain=$(echo "$vhost_domain" | tr -c 'A-Za-z0-9.-' '_')
  rm -f "${INSTALL_DIR}/nginx/conf.d/${safe_domain}.conf"
  rm -rf "${INSTALL_DIR}/nginx/ssl/domains/${safe_domain}"
  reload_nginx
  if [[ "$JSON_OUTPUT" == "true" ]]; then output_json true "OK" "\"domain\":\"$vhost_domain\""; fi
}

# ─────────────────────────────────────────────────────────────────
# Panel ports (host ports nginx is published on)
# ─────────────────────────────────────────────────────────────────
# Status of the last change, read by the backend at /app/nginx_host/.
PORTS_STATUS_FILE="${INSTALL_DIR}/nginx/.port-change.json"

ports_valid_number() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

# Prints a reason and returns 1 when H/S cannot be used.
ports_check_reason() {
  local h="$1" s="$2"
  if ! ports_valid_number "$h" || ! ports_valid_number "$s"; then
    echo "Ports must be numbers between 1 and 65535."
    return 1
  fi
  h=$((10#$h)); s=$((10#$s))
  if [[ "$h" == "$s" ]]; then
    echo "HTTP and HTTPS ports must be different."
    return 1
  fi
  local lock_pid
  lock_pid=$(cat "$LOCKFILE" 2>/dev/null || true)
  if [[ -n "$lock_pid" && "$lock_pid" != "$$" ]] && kill -0 "$lock_pid" 2>/dev/null; then
    echo "An SSL operation is running. Try again when it finishes."
    return 1
  fi
  local cur_h cur_s p
  cur_h=$(panel_http_port)
  cur_s=$(panel_https_port)
  for p in "$h" "$s"; do
    # Ports the panel already publishes are held by its own docker-proxy.
    [[ "$p" == "$cur_h" || "$p" == "$cur_s" ]] && continue
    if port_listening "$p"; then
      echo "Port ${p} is already used by another service on this server."
      return 1
    fi
  done
  return 0
}

ports_check() {
  local h="${1:-}" s="${2:-}" reason
  if reason=$(ports_check_reason "$h" "$s"); then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "PORTS_AVAILABLE" "\"httpPort\":$((10#$h)),\"httpsPort\":$((10#$s))"
    else
      echo -e "${GREEN}✔ Ports ${h}/${s} are available.${NC}"
    fi
    return 0
  fi
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json false "PORTS_UNAVAILABLE" "\"reason\":\"$(json_escape_str "$reason")\""
  else
    echo -e "${RED}✘ ${reason}${NC}" >&2
  fi
  return 1
}

json_escape_str() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/ }
  s=${s//$'\r'/}
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

ports_write_status() {
  local state="$1" h="$2" s="$3" ph="$4" ps="$5" msg="${6:-}"
  mkdir -p "$(dirname "$PORTS_STATUS_FILE")" 2>/dev/null || true
  printf '{"state":"%s","httpPort":%s,"httpsPort":%s,"previousHttpPort":%s,"previousHttpsPort":%s,"message":"%s","updatedAt":%s}\n' \
    "$state" "$h" "$s" "$ph" "$ps" "$(json_escape_str "$msg")" "$(date +%s)" \
    > "${PORTS_STATUS_FILE}.tmp" 2>/dev/null \
    && mv -f "${PORTS_STATUS_FILE}.tmp" "$PORTS_STATUS_FILE" 2>/dev/null || true
}

# Best effort: docker-published ports usually bypass host firewalls, but
# some providers' setups (ufw-docker, firewalld zones) do filter them.
ports_open_firewall() {
  local p
  for p in "$@"; do
    if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
      ufw allow "${p}/tcp" >/dev/null 2>&1 || true
    fi
    if command -v firewall-cmd &>/dev/null && firewall-cmd --state >/dev/null 2>&1; then
      firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null 2>&1 || true
    fi
  done
  if command -v firewall-cmd &>/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --reload >/dev/null 2>&1 || true
  fi
}

# Recreates nginx with the ports currently in .env. Returns 1 if the
# container could not start (e.g. "address already in use").
ports_apply_nginx() {
  local log="$1"
  cd "$INSTALL_DIR" 2>/dev/null || return 1
  compose up -d --force-recreate --no-deps nginx >>"$log" 2>&1 || return 1
  local i
  for ((i = 1; i <= 10; i++)); do
    [[ "$(docker inspect -f '{{.State.Running}}' hmpanel-nginx 2>/dev/null)" == "true" ]] && return 0
    sleep 1
  done
  return 1
}

# hm ports set <http> <https> [async]
ports_set() {
  local h="${1:-}" s="${2:-}" mode="${3:-}"
  local reason
  if ! reason=$(ports_check_reason "$h" "$s"); then
    if ports_valid_number "$h" && ports_valid_number "$s"; then
      ports_write_status "failed" "$((10#$h))" "$((10#$s))" "$(panel_http_port)" "$(panel_https_port)" "$reason"
    fi
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json false "PORTS_UNAVAILABLE" "\"reason\":\"$(json_escape_str "$reason")\""
      exit 21
    fi
    echo -e "${RED}✘ ${reason}${NC}" >&2
    return 1
  fi
  h=$((10#$h)); s=$((10#$s))

  # Shares the SSL lock: both rewrite and recreate nginx.
  acquire_ssl_lock

  local old_h old_s domain
  old_h=$(panel_http_port)
  old_s=$(panel_https_port)
  domain=$(panel_domain)

  if [[ "$h" == "$old_h" && "$s" == "$old_s" ]]; then
    ports_write_status "success" "$h" "$s" "$old_h" "$old_s" "Ports unchanged."
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "PORTS_UNCHANGED" "\"httpPort\":$h,\"httpsPort\":$s"
    else
      echo -e "${GREEN}✔ Panel already uses ports ${h}/${s}.${NC}"
    fi
    return 0
  fi

  ports_write_status "running" "$h" "$s" "$old_h" "$old_s" "Applying new ports..."
  # Async callers (the panel itself) need their HTTP response delivered
  # before nginx goes away.
  [[ "$mode" == "async" ]] && sleep 3

  local log_dir="${INSTALL_DIR}/logs"
  mkdir -p "$log_dir"
  local log="${log_dir}/ports-change.log"
  {
    echo "=== $(date '+%F %T') ports ${old_h}/${old_s} -> ${h}/${s}"
  } >>"$log"

  stream_progress "Opening ports ${h}/${s} in the firewall (if active)..."
  ports_open_firewall "$h" "$s"

  stream_progress "Switching panel to HTTP ${h} / HTTPS ${s}..."
  update_env "HTTP_PORT" "$h"
  update_env "HTTPS_PORT" "$s"

  if ports_apply_nginx "$log" && wait_for_nginx_health "$domain" 20; then
    ports_write_status "success" "$h" "$s" "$old_h" "$old_s" "Panel is now on HTTP ${h} / HTTPS ${s}."
    stream_progress "Panel answers on the new ports."
    if [[ "$JSON_OUTPUT" == "true" ]]; then
      output_json true "PORTS_CHANGED" "\"httpPort\":$h,\"httpsPort\":$s,\"previousHttpPort\":$old_h,\"previousHttpsPort\":$old_s"
    else
      echo -e "${GREEN}✔ Panel ports changed to HTTP ${h} / HTTPS ${s}.${NC}"
    fi
    return 0
  fi

  local fail_tail
  fail_tail=$(tail -n 8 "$log" 2>/dev/null | grep -v '^===' | grep -iE 'error|address|bind|port' | tail -n1 | cut -c1-200 || true)
  stream_progress "Panel did not come up on the new ports — restoring ${old_h}/${old_s}..."
  update_env "HTTP_PORT" "$old_h"
  update_env "HTTPS_PORT" "$old_s"
  ports_apply_nginx "$log" || docker start hmpanel-nginx >/dev/null 2>&1 || true
  wait_for_nginx_health "$domain" 30 || true

  local msg="The panel could not start on HTTP ${h} / HTTPS ${s}${fail_tail:+ (${fail_tail})}. Previous ports ${old_h}/${old_s} were restored."
  ports_write_status "rolled_back" "$h" "$s" "$old_h" "$old_s" "$msg"
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json false "PORTS_ROLLED_BACK" "\"reason\":\"$(json_escape_str "$msg")\",\"httpPort\":$old_h,\"httpsPort\":$old_s"
    exit 22
  fi
  echo -e "${RED}✘ ${msg}${NC}" >&2
  return 1
}

cmd_ports() {
  local cur_h cur_s
  cur_h=$(panel_http_port)
  cur_s=$(panel_https_port)
  echo -e "${BOLD}--- Panel Ports ---${NC}\n"
  echo -e "  Current: HTTP ${CYAN}${cur_h}${NC} / HTTPS ${CYAN}${cur_s}${NC}\n"
  local new_h new_s confirm
  read -rp "  New HTTP port [${cur_h}]: " new_h
  read -rp "  New HTTPS port [${cur_s}]: " new_s
  new_h="${new_h:-$cur_h}"
  new_s="${new_s:-$cur_s}"
  if ! ports_check "$new_h" "$new_s"; then
    read -rp "Press Enter to return to the menu..."
    return
  fi
  if [[ "$((10#$new_h))" != "80" ]]; then
    echo -e "  ${YELLOW}Note:${NC} with HTTP off port 80, issuing/renewing SSL needs port 80 free on this server."
  fi
  read -rp "  Apply HTTP ${new_h} / HTTPS ${new_s}? [y/N]: " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    ( ports_set "$new_h" "$new_s" ) || true
  fi
  read -rp "Press Enter to return to the menu..."
}

# ─────────────────────────────────────────────────────────────────
# Headless Command Parser (for API/Backend integration)
# ─────────────────────────────────────────────────────────────────
if [[ "$JSON_OUTPUT" == "true" || "${1:-}" == "ssl" || "${1:-}" == "doctor" || "${1:-}" == "version" || "${1:-}" == "backup" || "${1:-}" == "restore" || "${1:-}" == "heal" || "${1:-}" == "update" || "${1:-}" == "ports" ]]; then
  HEADLESS=true
  MODULE="${1:-}"
  ACTION="${2:-}"
  
  if [[ "$MODULE" == "ssl" ]]; then
    case "$ACTION" in
      issue)
        export PANEL_DOMAIN="${3:-}"
        export ADMIN_EMAIL="${4:-}"
        ssl_transactional "ssl_issue"
        ;;
      selfsigned)
        export PANEL_DOMAIN="${3:-}"
        ssl_transactional "ssl_selfsigned ${3:-}"
        ;;
      enable)
        ssl_enable
        ;;
      disable)
        ssl_disable
        ;;
      renew)
        ssl_renew "${3:-}"
        ;;
      repair)
        ssl_repair
        ;;
      change-domain)
        export PANEL_DOMAIN="${3:-}"
        export ADMIN_EMAIL="${4:-}"
        ssl_transactional "ssl_issue"
        ;;
      add-vhost)
        ssl_add_vhost "${3:-}" "${4:-}" "${5:-}" "${6:-}"
        ;;
      remove-vhost)
        ssl_remove_vhost "${3:-}"
        ;;
      *)
        if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "UNKNOWN_COMMAND"; exit 1; fi
        echo "Usage: hm ssl {issue <domain> <email> | change-domain <domain> <email> | add-vhost <domain> <email> | remove-vhost <domain> | enable | disable | renew [force] | repair}"
        exit 1
        ;;
    esac
  elif [[ "$MODULE" == "backup" ]]; then
    if [[ "$ACTION" == "create" ]]; then
      btype="${3:-full}"
      backup_path=""
      if backup_path=$(do_backup "$btype" "true"); then
        if [[ "$JSON_OUTPUT" == "true" ]]; then
          output_json true "BACKUP_OK" "\"path\":\"${backup_path//\"/\\\"}\""
        else
          echo "$backup_path"
        fi
        exit 0
      else
        if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "BACKUP_FAILED"; fi
        exit 1
      fi
    else
      echo "Usage: hm backup create {full|database|config}"
      exit 1
    fi
  elif [[ "$MODULE" == "restore" ]]; then
    # Strip accidental --json if it landed in ACTION
    if [[ "$ACTION" == "--json" || "$ACTION" == "--debug" ]]; then
      ACTION=""
    fi
    if [[ -n "$ACTION" ]]; then
      # Human CLI must be verbose. Only API --json stays quiet on stdout.
      restore_silent="false"
      if [[ "$JSON_OUTPUT" == "true" ]]; then restore_silent="true"; fi
      if do_restore "$ACTION" "$restore_silent"; then
        if [[ "$JSON_OUTPUT" == "true" ]]; then
          output_json true "RESTORE_OK" "\"file\":\"$ACTION\""
        else
          echo "RESTORE_OK $ACTION"
        fi
        exit 0
      else
        if [[ "$JSON_OUTPUT" == "true" ]]; then
          output_json false "RESTORE_FAILED" "\"file\":\"$ACTION\""
        else
          echo "RESTORE_FAILED $ACTION" >&2
        fi
        exit 1
      fi
    else
      echo "Usage: hm restore <filepath>"
      if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "RESTORE_MISSING_FILE"; fi
      exit 1
    fi
  elif [[ "$MODULE" == "ports" ]]; then
    case "$ACTION" in
      check)
        ports_check "${3:-}" "${4:-}" || exit 21
        ;;
      set)
        ports_set "${3:-}" "${4:-}" "${5:-}" || exit 1
        ;;
      get|"")
        if [[ "$JSON_OUTPUT" == "true" ]]; then
          output_json true "PORTS" "\"httpPort\":$(panel_http_port),\"httpsPort\":$(panel_https_port)"
        else
          echo "HTTP $(panel_http_port) / HTTPS $(panel_https_port)"
        fi
        ;;
      *)
        if [[ "$JSON_OUTPUT" == "true" ]]; then output_json false "UNKNOWN_COMMAND"; exit 1; fi
        echo "Usage: hm ports {get | check <http> <https> | set <http> <https>}"
        exit 1
        ;;
    esac
  elif [[ "$MODULE" == "doctor" ]]; then
    cmd_doctor
  elif [[ "$MODULE" == "version" ]]; then
    cmd_version
  elif [[ "$MODULE" == "heal" ]]; then
    curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/scripts/heal-panel.sh | bash
    exit $?
  elif [[ "$MODULE" == "update" ]]; then
    curl -fsSL https://raw.githubusercontent.com/neoauroraproject/hmpanel/main/update.sh | bash
    exit $?
  fi
  exit 0
fi

# ─────────────────────────────────────────────────────────────────
# Main Menu Loop
# ─────────────────────────────────────────────────────────────────
while true; do
  print_header
  
  echo -e "  1. Panel Status"
  echo -e "  2. Panel Information"
  echo -e "  3. Update HMPanel"
  echo -e "  4. Create Backup"
  echo -e "  5. Restore Backup"
  echo -e "  6. Restart Services"
  echo -e "  7. View Logs"
  echo -e "  8. SSL Management"
  echo -e "  9. System Cleanup"
  echo -e "  10. Uninstall HMPanel"
  echo -e "  11. Heal Panel (fix 502 / auth drift)"
  echo -e "  12. Change Panel Ports"
  echo -e "  0. Exit"
  echo ""
  
  read -rp "  Select an option: " choice
  echo ""
  
  case $choice in
    1) cmd_status ;;
    2) cmd_info ;;
    3) cmd_update ;;
    4) cmd_backup ;;
    5) cmd_restore ;;
    6) cmd_restart ;;
    7) cmd_logs ;;
    8) cmd_ssl ;;
    9) cmd_cleanup ;;
    10) cmd_uninstall ;;
    11) cmd_heal ;;
    12) cmd_ports ;;
    0) echo "Goodbye!"; exit 0 ;;
    *) echo -e "  ${RED}Invalid option!${NC}"; sleep 1 ;;
  esac
done
