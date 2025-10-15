#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/templates_schema.sql"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Schema file not found: $SCHEMA_FILE" >&2
  exit 1
fi

CONNECTION_URL=${PSQL_URL:-${NEON_DATABASE_URL:-}}

if [[ -z "$CONNECTION_URL" ]]; then
  echo "Set PSQL_URL or NEON_DATABASE_URL with your Postgres connection string." >&2
  exit 1
fi

psql "$CONNECTION_URL" -f "$SCHEMA_FILE"
