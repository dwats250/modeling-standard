#!/usr/bin/env bash
# Bring a disposable, Docker-less Linux sandbox (for example an agent's cloud
# workspace) to the state CI runs in: Node 24 with npm 11, and a local
# PostgreSQL 16+ server provisioned by db/provision.sql.
#
# NOT for developer machines. On a machine with Docker, use `npm run db:up`
# and an ordinary Node 24 install as the README describes.
#
# Usage, from the repository root, as root:
#
#   eval "$(scripts/sandbox-bootstrap.sh)"
#
# Progress goes to stderr. Stdout is a single `export PATH=...` line, so the
# eval puts Node 24 first on PATH for the calling shell. Every step is
# idempotent: re-running it restarts a stopped server and reuses everything
# already downloaded. Set MS_SANDBOX_INSTALL_DEPS=1 to also run `npm ci`.
#
# Requirements: root, a PostgreSQL 16+ server install under
# /usr/lib/postgresql/<major>/bin, a `postgres` system user, and an existing
# npm on PATH that can reach the npm registry (it is used only to download
# the Node 24 and npm 11 packages).

set -euo pipefail

log() { printf 'sandbox-bootstrap: %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sandbox_dir="${MS_SANDBOX_DIR:-/var/tmp/ms-sandbox}"
node_major="$(tr -d '[:space:]' < "$repo_root/.nvmrc")"
npm_major=11
pg_port=5432
pg_socket_dir=/tmp

[ "$(id -u)" -eq 0 ] || die "run as root (PostgreSQL is initialised as the postgres user)"
id postgres > /dev/null 2>&1 || die "no postgres system user"

mkdir -p "$sandbox_dir/bin" "$sandbox_dir/downloads"

# --- Node and npm --------------------------------------------------------------

fetch_package() {
  # fetch_package <npm spec> <target dir>: npm pack + extract, once.
  local spec="$1" target="$2"
  if [ -d "$target/package" ]; then
    return
  fi
  local tarball
  tarball="$(cd "$sandbox_dir/downloads" && npm pack --silent "$spec" | tail -n 1)"
  mkdir -p "$target"
  tar xzf "$sandbox_dir/downloads/$tarball" -C "$target"
}

current_major="$("$sandbox_dir/bin/node" -p 'process.versions.node.split(".")[0]' 2> /dev/null || true)"
if [ "$current_major" != "$node_major" ]; then
  command -v npm > /dev/null || die "need an existing npm on PATH to download Node $node_major"
  log "downloading Node $node_major and npm $npm_major"
  rm -rf "$sandbox_dir/node" "$sandbox_dir/npm"
  fetch_package "node-linux-x64@$node_major" "$sandbox_dir/node"
  fetch_package "npm@$npm_major" "$sandbox_dir/npm"
  ln -sf "$sandbox_dir/node/package/bin/node" "$sandbox_dir/bin/node"
  for tool in npm npx; do
    cat > "$sandbox_dir/bin/$tool" << EOF
#!/bin/sh
exec "$sandbox_dir/bin/node" "$sandbox_dir/npm/package/bin/$tool-cli.js" "\$@"
EOF
    chmod +x "$sandbox_dir/bin/$tool"
  done
fi
export PATH="$sandbox_dir/bin:$PATH"
log "node $(node -v), npm $(npm -v)"

# --- PostgreSQL ----------------------------------------------------------------

pg_bin=""
for dir in $(ls -d /usr/lib/postgresql/*/bin 2> /dev/null | sort -V -r); do
  major="$(basename "$(dirname "$dir")")"
  if [ "${major%%.*}" -ge 16 ] && [ -x "$dir/initdb" ]; then
    pg_bin="$dir"
    break
  fi
done
[ -n "$pg_bin" ] || die "no PostgreSQL 16+ server install under /usr/lib/postgresql"

pg_data="$sandbox_dir/pgdata"
as_postgres() { su postgres -s /bin/sh -c "$*"; }

if [ ! -s "$pg_data/PG_VERSION" ]; then
  log "initialising a throwaway cluster at $pg_data"
  rm -rf "$pg_data"
  mkdir -p "$pg_data"
  chown postgres:postgres "$pg_data"
  # Trust authentication on a loopback-only, disposable server: the same
  # posture as the CI service container.
  as_postgres "'$pg_bin/initdb' -D '$pg_data' -U postgres -A trust -E UTF8 > /dev/null"
fi

if ! as_postgres "'$pg_bin/pg_ctl' -D '$pg_data' status" > /dev/null 2>&1; then
  log "starting PostgreSQL ($pg_bin)"
  as_postgres "'$pg_bin/pg_ctl' -D '$pg_data' -l '$pg_data/server.log' -w \
    -o \"-h 127.0.0.1 -p $pg_port -k $pg_socket_dir\" start" > /dev/null
fi

psql_super() { psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$pg_port" -U postgres -d postgres "$@"; }

if [ "$(psql_super -tA -c "select count(*) from pg_roles where rolname = 'ms_migrator'")" = "0" ]; then
  log "provisioning roles and database (db/provision.sql)"
  psql_super -q -f "$repo_root/db/provision.sql" > /dev/null
fi
log "PostgreSQL ready on 127.0.0.1:$pg_port"

# --- Repository ----------------------------------------------------------------

if [ ! -f "$repo_root/.env" ]; then
  cp "$repo_root/.env.example" "$repo_root/.env"
  log "created .env from .env.example"
fi

if [ "${MS_SANDBOX_INSTALL_DEPS:-0}" = "1" ]; then
  log "installing dependencies (npm ci)"
  (cd "$repo_root" && npm ci --no-audit --no-fund > /dev/null)
fi

printf 'export PATH=%q:"$PATH"\n' "$sandbox_dir/bin"
