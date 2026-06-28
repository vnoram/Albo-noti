'use strict';

/**
 * Logger mínimo con timestamp en hora de Chile.
 * Reemplazable por winston/pino si se escala en el futuro.
 */

const config = require('../config');

function timestamp() {
  return new Date().toLocaleString('es-CL', {
    timeZone: config.timezone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const logger = {
  info:  (...args) => console.log(`[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
};

module.exports = logger;
