#!/bin/sh
# API-ს გაშვება usectl-ზე (Dockerfile → CMD). ცალკე release pod-ის ნაცვლად ყოველ start-ზე:
#   1. მიგრაციები (`prisma migrate deploy` — უკვე გამოყენებულს არ იმეორებს)
#   2. პირველი superadmin, თუ SEED_SUPERADMIN_* მითითებულია (არსებულის პაროლს არ ცვლის)
#   3. API
# RUN_MIGRATIONS=false — მიგრაციების გამოტოვება (მაგ. worker pod-ში).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[start] prisma migrate deploy"
  node_modules/.bin/prisma migrate deploy
fi

if [ -n "${SEED_SUPERADMIN_EMAIL}" ] && [ -n "${SEED_SUPERADMIN_PASSWORD}" ]; then
  echo "[start] superadmin"
  node dist/scripts/create-superadmin.js
fi

echo "[start] api"
exec node dist/main.js
