'use strict';

// Copia users, subscriptions, team_leagues y sent_notifications desde otra BD
// PostgreSQL (SOURCE_DATABASE_URL, p. ej. la de Railway) hacia DATABASE_URL.
// Idempotente: ON CONFLICT DO NOTHING. Conserva los ids y reajusta las secuencias.
require('dotenv').config();
const { Pool } = require('pg');
const dest   = require('../db/pool');
const logger = require('../utils/logger');

const TABLES = ['users', 'subscriptions', 'team_leagues', 'sent_notifications'];

async function main() {
  const srcUrl = process.env.SOURCE_DATABASE_URL;
  if (!srcUrl) throw new Error('Falta SOURCE_DATABASE_URL');
  // Railway TCP proxy suele no hablar SSL: probar con SSL y, si falla, sin SSL.
  let src;
  for (const ssl of [{ rejectUnauthorized: false }, false]) {
    const p = new Pool({ connectionString: srcUrl, ssl, connectionTimeoutMillis: 15000 });
    try { await p.query('SELECT 1'); src = p; logger.info(`Origen conectado (ssl=${!!ssl})`); break; }
    catch (e) { logger.warn(`Origen ssl=${!!ssl}: ${e.message}`); await p.end().catch(() => {}); }
  }
  if (!src) throw new Error('No se pudo conectar al origen');

  for (const t of TABLES) {
    let rows;
    try { rows = (await src.query(`SELECT * FROM ${t}`)).rows; }
    catch (e) {
      if (e.code === '42P01') { logger.warn(`${t}: no existe en origen; se omite`); continue; }
      throw e;
    }
    let inserted = 0;
    for (const r of rows) {
      const cols = Object.keys(r);
      const sql = `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT DO NOTHING`;
      inserted += (await dest.query(sql, cols.map(c => r[c]))).rowCount;
    }
    await dest.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${t}),1),1))`);
    logger.info(`${t}: origen=${rows.length} insertadas=${inserted}`);
  }
  await src.end();
  await dest.end();
}

main().catch(e => { logger.error('Copia fallida:', e.message); process.exit(1); });
