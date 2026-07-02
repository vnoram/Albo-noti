'use strict';

require('dotenv').config();
const pool   = require('./pool');
const logger = require('../utils/logger');

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  phone      VARCHAR(20)  NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    INT         NOT NULL,
  status     VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ligas ESPN a monitorear por equipo
CREATE TABLE IF NOT EXISTS team_leagues (
  id          SERIAL PRIMARY KEY,
  team_id     INT          NOT NULL,
  league_slug VARCHAR(60)  NOT NULL,
  team_name   VARCHAR(100),
  CONSTRAINT uq_team_league UNIQUE (team_id, league_slug)
);

-- source: 'espn' | 'sofascore'
CREATE TABLE IF NOT EXISTS sent_notifications (
  id         SERIAL PRIMARY KEY,
  source     VARCHAR(20)  NOT NULL DEFAULT 'espn',
  fixture_id BIGINT       NOT NULL,
  user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20)  NOT NULL CHECK (type IN ('prematch', 'reminder', 'lineup', 'result')),
  sent_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notification UNIQUE (source, fixture_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_team ON subscriptions(team_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sent_notif_fixture  ON sent_notifications(fixture_id);
CREATE INDEX IF NOT EXISTS idx_team_leagues_team   ON team_leagues(team_id);

-- Migracion: agregar columna source si ya existe la tabla sin ella
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='sent_notifications' AND column_name='source'
  ) THEN
    ALTER TABLE sent_notifications ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'espn';
    ALTER TABLE sent_notifications DROP CONSTRAINT IF EXISTS uq_notification;
    ALTER TABLE sent_notifications ADD CONSTRAINT uq_notification UNIQUE (source, fixture_id, user_id, type);
  END IF;
END $$;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    logger.info('Ejecutando migraciones...');
    await client.query(SQL);
    logger.info('Migracion completada.');
  } catch (err) {
    logger.error('Error en migracion:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
