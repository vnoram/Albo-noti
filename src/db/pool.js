'use strict';

const { Pool } = require('pg');
const config = require('../config');

/**
 * Pool de conexiones compartido por toda la aplicación.
 * Se crea una sola vez y se reutiliza.
 */
const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl,
  max: 5,               // máximo de conexiones simultáneas (suficiente para crons cortos)
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en cliente inactivo del pool:', err.message);
});

module.exports = pool;
