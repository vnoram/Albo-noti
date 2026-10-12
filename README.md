# Colo-Colo Notifier 🔵⚪

Servicio backend autónomo que notifica por WhatsApp cuándo juega Colo-Colo, con alineación y resultado. Corre en Azure (Container Apps Jobs + PostgreSQL) sin intervención manual.

---

## Arquitectura

```
Azure Container Apps Jobs (4 cron + 1 migración)
    │
    ▼
Backend Node.js
    ├── FootballService / SofaScoreService ──▶ ESPN + SofaScore (fixtures)
    ├── WhatsAppService ──▶ WhatsApp Cloud API (Meta)
    └── Repositories   ──▶ Azure Database for PostgreSQL
```

---

## Prerrequisitos (Fase 0 — sin código)

Completar esto antes de desplegar. Solo se hace una vez.

### 1. API-Football
1. Crear cuenta en https://dashboard.api-football.com/
2. Copiar la **API Key** desde "My Account → API Keys"
3. Guardarla como `API_FOOTBALL_KEY`

### 2. WhatsApp Cloud API (Meta)
1. Ir a https://developers.facebook.com/apps/
2. Crear una nueva app → tipo **Business**
3. Agregar el producto **WhatsApp**
4. En WhatsApp → Configuración de API:
   - Copiar el **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - Copiar el **Temporary Access Token** → `WHATSAPP_TOKEN`
5. En "Números de prueba" → agregar el número de tu papá como destinatario verificado
6. En **Plantillas de mensaje** → crear las 3 plantillas (categoría: Utility):

| Nombre | Cuerpo |
|---|---|
| `prematch` | `⚽ Hoy juega Colo-Colo vs {{1}} a las {{2}} en {{3}}. ¡Vamos los albos! 🔵⚪` |
| `recordatorio` | `⏰ En una hora juega Colo-Colo vs {{1}} ({{2}}) en {{3}}. ¡Vamos los albos! 🔵⚪` |
| `colocolo_lineup` | `📋 Alineación de Colo-Colo vs {{1}}:\n{{2}}` |
| `colocolo_result` | `🏁 Final: Colo-Colo {{1}} - {{2}} {{3}}` |

> ⚠️ Las plantillas deben ser aprobadas por Meta antes de usarlas. El proceso suele tardar minutos.

---

## Instalación y despliegue

### Paso 1: Clonar y configurar localmente

```bash
git clone https://github.com/TU_USUARIO/colocolo-notifier.git
cd colocolo-notifier
npm install
cp .env.example .env
# Editar .env con tus credenciales reales
```

### Paso 2: Encontrar los IDs de Colo-Colo y la liga

```bash
node src/scripts/find-ids.js
```

Anota el `COLOCOLO_TEAM_ID` y el `LEAGUE_ID` y actualiza `.env`.

### Paso 3: Desplegar en Azure (cuenta de estudiante)

Todo se crea en **un único resource group propio** (`rg-colocolo-notifier`, con tag
`project=colocolo-notifier`), así no se mezcla con Geo Constanza ni otros proyectos.
Borrar ese grupo elimina solo lo de Colo-Colo.

```bash
az login
cp azure/.env.azure.example azure/.env.azure   # completar valores (ignorado por git)
./azure/deploy.sh
```

Crea: Container Registry (Basic) · PostgreSQL Flexible Server (B1ms, 32 GB) ·
Container Apps Environment · 4 Jobs con cron (UTC) y 1 Job manual de migración (se ejecuta solo al final).
La imagen se construye en Azure (`az acr build`), no hace falta Docker local.

| Job | Schedule (UTC) | Descripción |
|---|---|---|
| job-colocolo-prematch | `0 12 * * *` | 09:00 Chile (UTC-3) |
| job-colocolo-reminder | `*/15 * * * *` | Envía cuando faltan 45-75 min para el partido |
| job-colocolo-lineup | `*/15 18-21 * * *` | 15:00–18:00 Chile |
| job-colocolo-result | `0,30 21-23 * * *` | 18:00–20:00 Chile |

> ⚠️ Cron en Azure es siempre UTC. Chile es UTC-3 (verano) o UTC-4 (invierno): ajustar en `azure/deploy.sh`.
> ⚠️ Suscripción de estudiante: solo permite ciertas regiones. Si `deploy.sh` falla por región,
> revisa `az policy assignment list` o prueba otra (`eastus2`, `brazilsouth`, `centralus`...) en `AZ_LOCATION`.

Actualizar tras un cambio de código: `git pull && ./azure/deploy.sh` (reconstruye imagen y actualiza los jobs).

### Paso 4: Traspasar datos desde Railway (una sola vez)

Mientras aún puedas leer la BD de Railway (o desde un backup `pg_dump`):

```bash
RAILWAY_DATABASE_URL='postgresql://...' ./azure/migrate-data.sh
```

Copia `users`, `subscriptions`, `team_leagues` y `sent_notifications` (evita reenviar avisos ya enviados).
Si Railway ya no está accesible, en su lugar: `npm run setup` apuntando `DATABASE_URL` a Azure
(abre antes tu IP en el firewall de PostgreSQL) para crear tablas y el usuario inicial.

### Paso 5: Verificar

```bash
az containerapp job start -n job-colocolo-prematch -g rg-colocolo-notifier
az containerapp job execution list -n job-colocolo-prematch -g rg-colocolo-notifier -o table
```

---

## Agregar nuevos destinatarios

Sin tocar el código, directamente en la base de datos:

```sql
-- Agregar un nuevo usuario
INSERT INTO users (name, phone) VALUES ('Amigo Juan', '+56987654321');

-- Suscribirlo a Colo-Colo (team_id=127)
INSERT INTO subscriptions (user_id, team_id, status)
VALUES (
  (SELECT id FROM users WHERE phone = '+56987654321'),
  127,
  'active'
);
```

O usar el script auxiliar:

```bash
node -e "
require('dotenv').config();
const UserRepository = require('./src/repositories/UserRepository');
UserRepository.addSubscriber({ name: 'Amigo Juan', phone: '+56987654321', teamId: 127 })
  .then(id => { console.log('Usuario creado, id:', id); process.exit(0); });
"
```

---

## Estructura del proyecto

```
Dockerfile                  Imagen del servicio (Node 20 alpine)
azure/
  deploy.sh                 Crea/actualiza todo en Azure (idempotente)
  migrate-data.sh           Copia datos Railway → Azure
  .env.azure.example        Plantilla de configuración (copiar a .env.azure)
src/
  config/index.js           Configuración centralizada (env vars)
  db/
    pool.js                 Pool de conexiones PostgreSQL
    migrate.js              Crea las 3 tablas (idempotente)
    seed.js                 Inserta el usuario inicial
  repositories/
    UserRepository.js       Acceso a users + subscriptions
    NotificationRepository.js Acceso a sent_notifications (idempotencia)
  services/
    FootballService.js      Integración con API-Football v3
    WhatsAppService.js      Integración con WhatsApp Cloud API
  templates/messages.js     Datos para las variables de cada plantilla
  jobs/
    prematch.js             Job: aviso día de partido
    reminder.js             Job: recordatorio 45-90 min antes del partido
    lineup.js               Job: aviso alineación
    result.js               Job: aviso resultado final
  scripts/
    find-ids.js             Utilidad para descubrir IDs (ejecutar una vez)
  utils/
    logger.js               Logger con timestamp en hora Chile
    chileTime.js            Utilidades de zona horaria
```

---

## Verificación rápida

```bash
# Probar conexión a API-Football
node src/scripts/find-ids.js

# Simular job prematch (ejecutar sin horario de cron)
node src/jobs/prematch.js

# Ver envíos registrados en BD
psql $DATABASE_URL -c "SELECT * FROM sent_notifications ORDER BY sent_at DESC LIMIT 10;"
```

---

## Costos

| Servicio | Plan | Costo |
|---|---|---|
| Azure (créditos estudiante) | ACR Basic ~US$5/mes + PostgreSQL B1ms (gratis 12 meses o ~US$13/mes) + Container Apps Jobs (consumo mínimo) | descuenta de los US$100 |
| WhatsApp Cloud API | Número de prueba Meta | $0 |
| **Total aprox.** | | **~US$5–18/mes** (de créditos) |
