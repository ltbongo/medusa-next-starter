#!/bin/sh
set -e
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"
cd /app/apps/backend/.medusa/server
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Waiting for database (max 90s)..."
  i=0
  while [ "$i" -lt 45 ]; do
    if node -e "
const net = require('net');
const u = new URL(process.env.DATABASE_URL);
const port = Number(u.port || 5432);
const host = u.hostname;
const s = net.connect({ host, port, timeout: 3000 });
s.on('connect', () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
s.on('timeout', () => { s.destroy(); process.exit(1); });
" 2>/dev/null; then
      echo "Database is reachable."
      break
    fi
    i=$((i + 1))
    sleep 2
  done
  if [ "$i" -ge 45 ]; then
    echo "ERROR: database not reachable after 90s" >&2
    exit 1
  fi
  if ! node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
c.connect().then(() => c.query('SELECT 1')).then(() => c.end()).then(() => process.exit(0)).catch((e) => { console.error('pg probe failed:', e.message); process.exit(1); });
"; then
    echo "ERROR: PostgreSQL auth/query probe failed (check DATABASE_URL password vs volume)" >&2
    exit 1
  fi
  npx medusa db:migrate || { echo "ERROR: medusa db:migrate failed" >&2; exit 1; }
  node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(\"SELECT token FROM api_key WHERE type = 'publishable' ORDER BY created_at ASC LIMIT 1\");
  const token = r.rows[0]?.token;
  if (token) console.log('B9_PUBLISHABLE_API_KEY:' + token);
  await c.end();
})().catch((e) => { console.error('WARN: could not read publishable key:', e.message); process.exit(0); });
" || true
fi

if [ "${B9_RUN_DEMO_SEED:-1}" = "1" ]; then
  npx medusa start &
  MEDUSA_PID=$!
  echo "Waiting for Medusa health before demo seed (max 120s)..."
  j=0
  while [ "$j" -lt 60 ]; do
    if wget -q --spider http://127.0.0.1:9000/health 2>/dev/null; then
      echo "Medusa is healthy; running demo seed..."
      npx medusa exec ./src/scripts/seed-demo.js || echo "WARN: demo seed step failed (non-fatal if already seeded)"
      break
    fi
    j=$((j + 1))
    sleep 2
  done
  if [ "$j" -ge 60 ]; then
    echo "WARN: Medusa health timeout; skipping demo seed"
  fi
  wait "$MEDUSA_PID"
else
  exec npx medusa start
fi
