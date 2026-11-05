#!/usr/bin/env bash
# The reviewer security suite's disposable PostgreSQL: one labelled container on
# 127.0.0.1:5471, data on tmpfs, credentials generated per `up` into an
# owner-only directory and never printed. It touches nothing it did not create.
#
#   MS_REVIEWER_SECURITY_DIR=<private dir> tests/reviewer-security/harness.sh up|down
#   MS_REVIEWER_SECURITY_DIR=<private dir> tests/reviewer-security/harness.sh run <command...>
#
# `run` gives one command the isolated DATABASE_URL and MIGRATION_DATABASE_URL.
# It refuses a checkout with a .env, because vitest's configs would load it.
set -euo pipefail
set +x

NAME=ms-reviewer-security-postgres-5471
LABEL=ms.owner=reviewer-security
PORT=5471
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${MS_REVIEWER_SECURITY_DIR:?set MS_REVIEWER_SECURITY_DIR to a private directory outside the repository}"
case "$DIR/" in "$ROOT"/*) echo "MS_REVIEWER_SECURITY_DIR must be outside the repository" >&2; exit 1 ;; esac

owned() { [ "$(docker inspect -f '{{index .Config.Labels "ms.owner"}}' "$NAME" 2>/dev/null)" = reviewer-security ]; }

case "${1:-}" in
  up)
    if docker inspect "$NAME" >/dev/null 2>&1; then echo "$NAME already exists" >&2; exit 1; fi
    if ss -ltnH "sport = :$PORT" | grep -q .; then echo "port $PORT is in use; not ours" >&2; exit 1; fi
    (umask 077; mkdir -p "$DIR"); chmod 700 "$DIR"
    SUPER="$(openssl rand -hex 24)"; MIGRATOR="$(openssl rand -hex 24)"; RUNTIME="$(openssl rand -hex 24)"
    (umask 077; printf '%s' "$SUPER" > "$DIR/superuser.password")
    # The password goes in a mounted file, so it is not in `docker inspect`.
    docker run -d --name "$NAME" --label "$LABEL" -p "127.0.0.1:$PORT:5432" \
      --tmpfs /var/lib/postgresql/data:rw,mode=0700,uid=999,gid=999 \
      -v "$DIR/superuser.password:/run/ms-superuser.password:ro" \
      -e POSTGRES_USER=ms_rsec_super -e POSTGRES_DB=postgres -e POSTGRES_PASSWORD_FILE=/run/ms-superuser.password \
      postgres:17 >/dev/null
    for _ in $(seq 1 60); do
      if docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U ms_rsec_super; then break; fi
      sleep 1
    done
    docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U ms_rsec_super
    # Variables on stdin, so they are not in any process's arguments.
    { printf "\\\\set migrator_password '%s'\n\\\\set runtime_password '%s'\n" "$MIGRATOR" "$RUNTIME"
      cat "$ROOT/docs/engineering/reviewer-access/provision-cluster.sql"
      # What the security suite checks before it runs anything destructive.
      echo 'CREATE ROLE ms_reviewer_security_marker NOLOGIN;'
    } | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U ms_rsec_super -d postgres >/dev/null
    (umask 077; cat > "$DIR/test.env" <<ENV
DATABASE_URL=postgres://ms_reviewer_runtime:$RUNTIME@127.0.0.1:$PORT/ms_reviewer_admin
MIGRATION_DATABASE_URL=postgres://ms_reviewer_migrator:$MIGRATOR@127.0.0.1:$PORT/ms_reviewer_admin
REVIEWER_SECURITY_SUPERUSER_URL=postgres://ms_rsec_super:$SUPER@127.0.0.1:$PORT/postgres
ENV
    )
    echo "up: $NAME on 127.0.0.1:$PORT"
    ;;
  down)
    if owned; then docker rm -f "$NAME" >/dev/null; rm -f "$DIR/test.env" "$DIR/superuser.password"; echo "down: $NAME"; else echo "$NAME is not running or not ours; nothing done"; fi
    ;;
  run)
    shift
    owned || { echo "$NAME is not up" >&2; exit 1; }
    [ ! -e "$ROOT/.env" ] || { echo "$ROOT/.env exists; refusing, because vitest would load it" >&2; exit 1; }
    set -a; . "$DIR/test.env"; set +a
    exec "$@"
    ;;
  *) echo "usage: harness.sh up|down|run <command...>" >&2; exit 2 ;;
esac
