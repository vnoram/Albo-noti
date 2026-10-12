#!/usr/bin/env bash
# Copia los DATOS (usuarios, suscripciones, ligas, notificaciones enviadas) de Railway a Azure.
# Ejecutar DESPUES de azure/deploy.sh (que ya creo las tablas).
#
# Uso: RAILWAY_DATABASE_URL='postgresql://...' ./azure/migrate-data.sh
# (la URL publica esta en Railway -> servicio Postgres -> Variables -> DATABASE_PUBLIC_URL)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source azure/.env.azure; set +a
: "${RAILWAY_DATABASE_URL:?Define RAILWAY_DATABASE_URL}"

RG="rg-${AZ_PREFIX}-notifier"; PG="pg-${AZ_PREFIX}-notifier"
MY_IP="$(curl -s https://api.ipify.org)"
az account set --subscription "$AZ_SUBSCRIPTION_ID"

echo "▶ Abriendo firewall temporalmente para $MY_IP"
az postgres flexible-server firewall-rule create -g "$RG" -n "$PG" --rule-name tmp-migracion \
  --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" -o none
trap 'az postgres flexible-server firewall-rule delete -g "$RG" -n "$PG" --rule-name tmp-migracion --yes -o none' EXIT

AZ_URL="postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG}.postgres.database.azure.com:5432/colocolo_notifier?sslmode=require"
echo "▶ Copiando datos Railway → Azure"
pg_dump --data-only --no-owner --no-privileges --disable-triggers \
  -t users -t subscriptions -t team_leagues -t sent_notifications "$RAILWAY_DATABASE_URL" \
  | psql "$AZ_URL" -v ON_ERROR_STOP=1
psql "$AZ_URL" -c "SELECT setval(pg_get_serial_sequence('users','id'), COALESCE(MAX(id),1)) FROM users;" \
                -c "SELECT setval(pg_get_serial_sequence('subscriptions','id'), COALESCE(MAX(id),1)) FROM subscriptions;" \
                -c "SELECT setval(pg_get_serial_sequence('team_leagues','id'), COALESCE(MAX(id),1)) FROM team_leagues;" \
                -c "SELECT setval(pg_get_serial_sequence('sent_notifications','id'), COALESCE(MAX(id),1)) FROM sent_notifications;"
echo "✔ Datos migrados. Firewall temporal cerrado."
