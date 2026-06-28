'use strict';

const axios  = require('axios');
const logger = require('../utils/logger');

/**
 * SofaScoreService — fuente secundaria para Copa Chile y competencias
 * no indexadas en ESPN.
 *
 * API no oficial de SofaScore (misma que usa su web/app).
 * ID de Colo-Colo en SofaScore: 1940
 *
 * Para agregar otros equipos, buscar su SofaScore ID en:
 * https://www.sofascore.com/ -> URL del equipo contiene el ID
 */

const BASE = 'https://api.sofascore.com/api/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9',
  'Origin': 'https://www.sofascore.com',
  'Referer': 'https://www.sofascore.com/',
  'Cache-Control': 'no-cache',
};

const http = axios.create({ headers: HEADERS, timeout: 12000 });

/**
 * Mapa de ESPN team_id -> SofaScore team_id.
 * Ampliar segun se agreguen mas equipos.
 * Para encontrar el ID de SofaScore: busca el equipo en sofascore.com
 * y mira la URL, ej: /team/colo-colo/1940 -> ID es 1940
 */
const ESPN_TO_SOFASCORE = {
  2688: 1940, // Colo-Colo
};

function _normalizeStatus(ssStatus) {
  // SofaScore status types
  const map = {
    notstarted: 'NS',
    inprogress:  '1H',
    halftime:    'HT',
    finished:    'FT',
    postponed:   'PST',
    canceled:    'CANC',
    suspended:   'SUSP',
  };
  return map[(ssStatus || '').toLowerCase()] || ssStatus;
}

function _normalizeEvent(e) {
  const kickoff = e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '';
  return {
    id:          'ss_' + e.id,   // prefijo para distinguir de ESPN IDs
    sourceId:    e.id,           // ID original de SofaScore
    source:      'sofascore',
    date:        kickoff,
    league:      (e.tournament && e.tournament.name) || 'Copa Chile',
    status:      _normalizeStatus(e.status && e.status.type),
    home:        { id: e.homeTeam && e.homeTeam.id, name: (e.homeTeam && e.homeTeam.name) || '' },
    away:        { id: e.awayTeam && e.awayTeam.id, name: (e.awayTeam && e.awayTeam.name) || '' },
    goals: {
      home: (e.homeScore && (e.homeScore.current !== undefined ? e.homeScore.current : null)) || null,
      away: (e.awayScore && (e.awayScore.current !== undefined ? e.awayScore.current : null)) || null,
    },
    venue: { name: (e.venue && e.venue.name) || '', city: (e.venue && e.venue.city && e.venue.city.name) || '' },
  };
}

const SofaScoreService = {

  /**
   * Retorna el SofaScore team ID para un ESPN team ID.
   * Retorna null si no hay mapeo configurado.
   */
  getSofaScoreId(espnTeamId) {
    return ESPN_TO_SOFASCORE[parseInt(espnTeamId, 10)] || null;
  },

  /**
   * Registrar manualmente un mapeo ESPN -> SofaScore.
   * Llamar desde seed.js si se agregan nuevos equipos.
   */
  addMapping(espnId, sofaId) {
    ESPN_TO_SOFASCORE[parseInt(espnId, 10)] = parseInt(sofaId, 10);
  },

  /**
   * Busca partidos del equipo HOY en SofaScore.
   * @param {number} espnTeamId  ID del equipo en ESPN
   * @param {string} date        Fecha 'YYYY-MM-DD' en hora Chile
   * @returns {Array} Fixtures normalizados (mismo formato que FootballService)
   */
  async getMatchesToday(espnTeamId, date) {
    const sofaId = SofaScoreService.getSofaScoreId(espnTeamId);
    if (!sofaId) {
      logger.warn('[SofaScore] Sin mapeo para ESPN team_id=' + espnTeamId + '. Agregar a ESPN_TO_SOFASCORE.');
      return [];
    }

    logger.info('[SofaScore] Buscando partidos team=' + espnTeamId + ' (sofaId=' + sofaId + ') fecha=' + date);

    try {
      // SofaScore /events/next/0 retorna los proximos eventos paginados
      // Pag 0 = los mas proximos
      const r = await http.get(BASE + '/team/' + sofaId + '/events/next/0');
      const events = r.data.events || [];

      const todayEvents = events.filter(e => {
        if (!e.startTimestamp) return false;
        const eDate = new Date(e.startTimestamp * 1000).toISOString().slice(0, 10);
        return eDate === date;
      });

      logger.info('[SofaScore] ' + todayEvents.length + ' partido(s) hoy de ' + events.length + ' proximos');
      return todayEvents.map(_normalizeEvent);
    } catch (err) {
      // SofaScore puede bloquear en algunos entornos — no es fatal
      logger.warn('[SofaScore] No disponible: ' + err.message + ' (Copa Chile no se detectara hoy)');
      return [];
    }
  },

  /**
   * Obtiene el estado actual de un fixture de SofaScore.
   * @param {number} sofaEventId  ID del evento en SofaScore (sin prefijo 'ss_')
   */
  async getFixtureStatus(sofaEventId) {
    try {
      const r = await http.get(BASE + '/event/' + sofaEventId);
      const e = r.data.event || {};
      return _normalizeEvent(e);
    } catch (err) {
      logger.error('[SofaScore] Error estado evento ' + sofaEventId + ':', err.message);
      throw err;
    }
  },
};

module.exports = SofaScoreService;
