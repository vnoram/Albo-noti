'use strict';

const config = require('../config');

/**
 * Retorna la fecha actual en Chile como string YYYY-MM-DD.
 * Crítico: nunca usar new Date().toISOString() directamente porque
 * el servidor en Railway puede estar en UTC u otra zona horaria.
 */
function todayInChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone }); // 'en-CA' → YYYY-MM-DD
}

/**
 * Retorna la hora actual en Chile como número (ej: 14 para las 14:xx).
 */
function currentHourInChile() {
  return parseInt(
    new Date().toLocaleString('es-CL', { timeZone: config.timezone, hour: '2-digit', hour12: false }),
    10
  );
}

/**
 * Convierte una fecha UTC de la API al timestamp de Chile para comparar horas.
 * @param {string} utcDateString - Fecha UTC (ej: "2026-06-21T22:00:00+00:00")
 * @returns {Date}
 */
function toChileDate(utcDateString) {
  return new Date(utcDateString);
}

/**
 * Retorna cuántos minutos faltan hasta el inicio del partido (puede ser negativo si ya pasó).
 * @param {string} fixtureDate - Fecha del partido en UTC
 * @returns {number} minutos
 */
function minutesUntilMatch(fixtureDate) {
  const now = Date.now();
  const kickoff = new Date(fixtureDate).getTime();
  return Math.round((kickoff - now) / 60000);
}

module.exports = { todayInChile, currentHourInChile, toChileDate, minutesUntilMatch };
