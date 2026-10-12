#!/usr/bin/env bash
# Despliega Colo-Colo Notifier en Azure (idempotente: se puede re-ejecutar para actualizar).
#
# Todo vive en UN resource group propio (rg-<prefijo>-notifier), separado de otros
# proyectos (p. ej. Geo Constanza). Nada de este script toca otros grupos.
#
# Recursos: ACR (imagen) + PostgreSQL Flexible (B1ms) + Container Apps Environment
#           + 4 Jobs programados (cron UTC) + 1 Job manual de migracion.
#
# Uso:  az login && ./azure/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="azure/.env.azure"
[[ -f "$ENV_FILE" ]] || { echo "Falta $ENV_FILE (copia azure/.env.azure.example)"; exit 1; }
set -a; source "$ENV_FILE"; set +a

: "${AZ_SUBSCRIPTION_ID:?}" "${AZ_LOCATION:?}" "${AZ_PREFIX:?}" "${PG_ADMIN_USER:?}" "${PG_ADMIN_PASSWORD:?}"
: "${WHATSAPP_TOKEN:?}" "${WHATSAPP_PHONE_NUMBER_ID:?}"

RG="rg-${AZ_PREFIX}-notifier"
ACR="${AZ_PREFIX//-/}notifier$(echo -n "$AZ_SUBSCRIPTION_ID" | cksum | cut -d' ' -f1)"   # nombre global unico
PG="pg-${AZ_PREFIX}-notifier"
DB="colocolo_notifier"
CAE="cae-${AZ_PREFIX}-notifier"
TAGS="project=colocolo-notifier owner=colocolo"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"

az account set --subscription "$AZ_SUBSCRIPTION_ID"
az extension add --name containerapp --upgrade --only-show-errors
for p in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL; do
  az provider register --namespace "$p" --wait --only-show-errors
done

echo "▶ Resource group $RG ($AZ_LOCATION)"
az group create -n "$RG" -l "$AZ_LOCATION" --tags $TAGS -o none

echo "▶ Container Registry $ACR"
az acr show -n "$ACR" -g "$RG" -o none 2>/dev/null || \
  az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true --tags $TAGS -o none
# SKIP_BUILD=1 si la imagen ya se subio por otro medio (las suscripciones de estudiante
# suelen tener ACR Tasks bloqueado: TasksOperationsNotAllowed).
if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "▶ Build de la imagen en Azure (no requiere Docker local)"
  az acr build -r "$ACR" -g "$RG" -t "colocolo-notifier:$IMAGE_TAG" -t "colocolo-notifier:latest" . -o none
fi
IMAGE="$ACR.azurecr.io/colocolo-notifier:$IMAGE_TAG"
ACR_USER="$(az acr credential show -n "$ACR" --query username -o tsv)"
ACR_PASS="$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)"

echo "▶ PostgreSQL Flexible Server $PG"
if ! az postgres flexible-server show -n "$PG" -g "$RG" -o none 2>/dev/null; then
  az postgres flexible-server create -n "$PG" -g "$RG" -l "$AZ_LOCATION" \
    --admin-user "$PG_ADMIN_USER" --admin-password "$PG_ADMIN_PASSWORD" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --public-access 0.0.0.0 --tags $TAGS --yes -o none     # 0.0.0.0 = solo servicios Azure
fi
az postgres flexible-server db show -g "$RG" --server-name "$PG" --database-name "$DB" -o none 2>/dev/null || \
  az postgres flexible-server db create -g "$RG" --server-name "$PG" --name "$DB" -o none
PG_HOST="$PG.postgres.database.azure.com"
DATABASE_URL="postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_HOST}:5432/${DB}?sslmode=require"

echo "▶ Container Apps Environment $CAE"
az containerapp env show -n "$CAE" -g "$RG" -o none 2>/dev/null || \
  az containerapp env create -n "$CAE" -g "$RG" -l "$AZ_LOCATION" --environment-mode WorkloadProfiles --tags $TAGS -o none   # NO "Express": no admite Jobs

# upsert_job <nombre> <cron|manual> <comando-js>
upsert_job() {
  local name="job-${AZ_PREFIX}-$1" cron="$2" script="$3"
  local trigger=(--trigger-type Schedule --cron-expression "$cron")
  [[ "$cron" == "manual" ]] && trigger=(--trigger-type Manual)
  if az containerapp job show -n "$name" -g "$RG" -o none 2>/dev/null; then
    echo "  ↻ actualizando $name"
    az containerapp job update -n "$name" -g "$RG" --image "$IMAGE" -o none
  else
    echo "  + creando $name ($cron)"
    az containerapp job create -n "$name" -g "$RG" --environment "$CAE" "${trigger[@]}" \
      --replica-timeout 300 --replica-retry-limit 1 --replica-completion-count 1 --parallelism 1 \
      --image "$IMAGE" --cpu 0.25 --memory 0.5Gi \
      --registry-server "$ACR.azurecr.io" --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
      --command "node" --args "$script" \
      --secrets "database-url=$DATABASE_URL" "whatsapp-token=$WHATSAPP_TOKEN" \
      --env-vars "NODE_ENV=production" "TZ=America/Santiago" \
        "DATABASE_URL=secretref:database-url" "WHATSAPP_TOKEN=secretref:whatsapp-token" \
        "WHATSAPP_PHONE_NUMBER_ID=$WHATSAPP_PHONE_NUMBER_ID" \
        "WA_TEMPLATE_PREMATCH=${WA_TEMPLATE_PREMATCH:-prematch}" \
        "WA_TEMPLATE_REMINDER=${WA_TEMPLATE_REMINDER:-recordatorio}" \
        "WA_TEMPLATE_LINEUP=${WA_TEMPLATE_LINEUP:-colocolo_lineup}" \
        "WA_TEMPLATE_RESULT=${WA_TEMPLATE_RESULT:-colocolo_result}" \
        "COLOCOLO_TEAM_ID=${COLOCOLO_TEAM_ID:-2688}" "ESPN_LEAGUE=${ESPN_LEAGUE:-chi.1}" \
      --tags $TAGS -o none
  fi
}

echo "▶ Jobs"
upsert_job migrate   manual                  src/db/migrate.js
upsert_job prematch  "0 12 * * *"            src/jobs/prematch.js   # 09:00 Chile
upsert_job reminder  "*/15 * * * *"          src/jobs/reminder.js
upsert_job lineup    "*/15 18-21 * * *"      src/jobs/lineup.js
upsert_job result    "0,30 21-23 * * *"      src/jobs/result.js

echo "▶ Ejecutando migraciones (crea tablas)"
az containerapp job start -n "job-${AZ_PREFIX}-migrate" -g "$RG" -o none

cat <<MSG

✔ Listo. Recursos en el grupo: $RG
  Ver ejecuciones:  az containerapp job execution list -n job-${AZ_PREFIX}-prematch -g $RG -o table
  Probar un job:    az containerapp job start -n job-${AZ_PREFIX}-prematch -g $RG
  Borrar TODO lo de Colo-Colo (y solo eso):  az group delete -n $RG --yes
MSG
