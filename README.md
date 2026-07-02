# Colo-Colo Notifier 🔵⚪

Servicio backend autónomo que notifica por WhatsApp cuándo juega Colo-Colo, con alineación y resultado. Corre 24/7 en Railway sin intervención manual.

---

## Arquitectura

```
Railway Cron Jobs (4)
    │
    ▼
Backend Node.js
    ├── FootballService / SofaScoreService ──▶ ESPN + SofaScore (fixtures)
    ├── WhatsAppService ──▶ WhatsApp Cloud API (Meta)
    └── Repositories   ──▶ PostgreSQL (Railway)
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
| `colocolo_prematch` | `⚽ Hoy juega Colo-Colo vs {{1}} a las {{2}} en {{3}}. ¡Vamos los albos! 🔵⚪` |
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

### Paso 3: Crear y poblar la base de datos

Primero crea un proyecto en Railway con un servicio PostgreSQL.
Copia el `DATABASE_URL` que Railway genera y ponlo en `.env`.

```bash
# Crear tablas
npm run migrate

# Insertar tu papá como primer usuario
# (edita INITIAL_USER_NAME y INITIAL_USER_PHONE en .env primero)
node src/db/seed.js
```

### Paso 4: Subir a GitHub

```bash
git add .
git commit -m "feat: initial backend"
git push origin main
```

### Paso 5: Desplegar en Railway

1. En Railway → tu proyecto → **New Service → GitHub Repo**
2. Apuntar al repositorio
3. En **Variables**, agregar todas las de `.env.example` con valores reales
4. Railway desplegará automáticamente en cada push a `main`

### Paso 6: Configurar los Cron Jobs en Railway

En tu proyecto Railway → **New Service → Cron Job** (crear 4):

| Nombre | Comando | Schedule (UTC) | Descripción |
|---|---|---|---|
| prematch-daily | `npm run job:prematch` | `0 12 * * *` | 09:00 Chile (UTC-3) |
| reminder-check | `npm run job:reminder` | `*/15 * * * *` | Cada 15 min, todo el día — envía cuando faltan 45-90 min para el partido |
| lineup-check | `npm run job:lineup` | `*/15 18-21 * * *` | Cada 15 min, 15:00–18:00 Chile |
| result-check | `npm run job:result` | `0,30 21-23 * * *` | Cada 30 min, 18:00–20:00 Chile |

> ⚠️ Ajustar los horarios según la hora habitual de los partidos de Colo-Colo.
> Chile es UTC-3 (invierno) o UTC-4 (verano). Verificar siempre con un convertidor.

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

# Ver envíos re