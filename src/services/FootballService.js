'use strict';

const axios  = require('axios');
const logger = require('../utils/logger');

/**
 * FootballService — ESPN API publica, sin costo, sin API key.
 *
 * Ligas disponibles via scoreboard:
 *   chi.1                  Primera Division Chile
 *   conmebol.libertadores  Copa Libertadores
 *   conmebol.sudamericana  Copa Sudamericana
 *
 * Copa Chile (chi.2) NO tiene datos actuales en ESPN.
 * Se usa getMatchesTodayAllComps() para detectarla via nextEvent del equipo.
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const http = axios.create({ timeout: 12000 });

function parseScore(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'object' && s.displayValue !== undefined) return parseInt(s.displayValue, 10);
  return parseInt(s, 10);
}

function normalizeCompetition(e, leagueSlug) {
  const comp     = e.competitions[0];
  const homeTeam = comp.competitors.find(c => c.homeAway === 'home') || {};
  const awayTeam = comp.competitors.find(c => c.homeAway === 'away') || {};
  const venue    = comp.venue || {};
  const status   = (comp.status && comp.status.type && comp.status.type.name) || 'STATUS_SCHEDULED';
  return {
    id:     parseInt(e.id, 10),
    date:   e.date,
    league: leagueSlug,
    status: FootballService._normalizeStatus(status),
    home:   { id: parseInt(homeTeam.team && homeTeam.team.id, 10), name: (homeTeam.team && homeTeam.team.displayName) || '' },
    away:   { id: parseInt(awayTeam.team && awayTeam.team.id, 10), name: (awayTeam.team && awayTeam.team.displayName) || '' },
    goals:  { home: parseScore(homeTeam.score), away: parseScore(awayTeam.score) },
    venue:  { name: venue.fullName || '', city: (venue.address && venue.address.city) || '' },
  };
}

const FootballService = {

  /**
   * Busca partidos del equipo en la liga indicada (via scoreboard ESPN).
   * Funciona para chi.1, conmebol.libertadores, conmebol.sudamericana.
   */
  async getMatchesToday(teamId, date, leagueSlug) {
    const league  = leagueSlug || 'chi.1';
    const dateESPN = date.replace(/-/g, '');
    const url = ESPN_BASE + '/' + league + '/scoreboard?dates=' + dateESPN + '&limit=50';
    logger.info('[ESPN] team=' + teamId + ' date=' + date + ' liga=' + league);
    try {
      const r = await http.get(url);
      const events = (r.data.events || []).filter(e =>
        e.competitions && e.competitions[0] &&
        e.competitions[0].competitors.some(c => parseInt(c.team.id, 10) === parseInt(teamId, 10))
      );
      logger.info('[ESPN] ' + events.length + ' partido(s) via scoreboard');
      return events.map(e => normalizeCompetition(e, league));
    } catch (err) {
      logger.error('[ESPN] Error scoreboard (' + league + '):', err.message);
      return [];
    }
  },

  /**
   * Detecta partidos HOY en CUALQUIER competencia usando el endpoint del equipo.
   * Cubre Copa Chile y otras competencias que ESPN no tiene en su scoreboard.
   *
   * Estrategia: ESPN devuelve el proximo partido del equipo en nextEvent.
   * Si ese partido es hoy, lo retorna con datos completos via summary.
   */
  async getMatchesTodayAllComps(teamId, date) {
    const url = ESPN_BASE + '/chi.1/teams/' + teamId;
    logger.info('[ESPN] Buscando partidos todas las competencias team=' + teamId);
    try {
      const r = await http.get(url);
      const team = r.data.team || {};
      const nextEvents = team.nextEvent || [];

      const todayEvents = nextEvents.filter(e => e.date && e.date.slice(0, 10) === date);
      if (todayEvents.length === 0) {
        logger.info('[ESPN] Sin partidos hoy via nextEvent');
        return [];
      }

      // Para cada evento de hoy, obtener datos completos via summary
      const results = [];
      for (const e of todayEvents) {
        try {
          const fixture = await FootballService._getFixtureFromSummary(e.id, 'chi.1');
          if (fixture) results.push(fixture);
        } catch (err) {
          logger.error('[ESPN] Error summary evento ' + e.id + ':', err.message);
        }
      }
      logger.info('[ESPN] ' + results.length + ' partido(s) via nextEvent (todas las competencias)');
      return results;
    } catch (err) {
      logger.error('[ESPN] Error team endpoint:', err.message);
      return [];
    }
  },

  async _getFixtureFromSummary(fixtureId, leagueSlug) {
    const league = leagueSlug || 'chi.1';
    const url = ESPN_BASE + '/' + league + '/summary?event=' + fixtureId;
    const r   = await http.get(url);
    const hdr  = r.data.header || {};
    const comp = (hdr.competitions && hdr.competitions[0]) || {};
    const home = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
    const away = (comp.competitors || []).find(c => c.homeAway === 'away') || {};
    const venue = (comp.venue || {});
    const status = (comp.status && comp.status.type && comp.status.type.name) || 'STATUS_SCHEDULED';
    // Detectar el nombre de la competencia
    const compName = (comp.series && comp.series.title) ||
                     (hdr.league && hdr.league.name) ||
                     (comp.tournament && comp.tournament.displayName) || league;
    return {
      id:     parseInt(fixtureId, 10),
      date:   comp.date || (hdr.competitions && hdr.competitions[0] && hdr.competitions[0].date) || '',
      league: compName,
      status: FootballService._normalizeStatus(status),
      home:   { id: parseInt(home.id, 10), name: (home.team && home.team.displayName) || '' },
      away:   { id: parseInt(away.id, 10), name: (away.team && away.team.displayName) || '' },
      goals:  { home: parseScore(home.score), away: parseScore(away.score) },
      venue:  { name: venue.fullName || '', city: (venue.address && venue.address.city) || '' },
    };
  },

  async getFixtureStatus(fixtureId, leagueSlug) {
    const league = leagueSlug || 'chi.1';
    const url = ESPN_BASE + '/' + league + '/summary?event=' + fixtureId;
    logger.info('[ESPN] estado fixture=' + fixtureId + ' liga=' + league);
    try {
      const r    = await http.get(url);
      const hdr  = r.data.header || {};
      const comp = (hdr.competitions && hdr.competitions[0]) || {};
      const home = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
      const away = (comp.competitors || []).find(c => c.homeAway === 'away') || {};
      const statusName = (comp.status && comp.status.type && comp.status.type.name) || '';
      return {
        id:     fixtureId,
        league: league,
        status: FootballService._normalizeStatus(statusName),
        home:   { id: parseInt(home.id, 10), name: (home.team && home.team.displayName) || '' },
        away:   { id: parseInt(away.id, 10), name: (away.team && away.team.displayName) || '' },
        goals:  { home: parseScore(home.score), away: parseScore(away.score) },
      };
    } catch (err) {
      logger.error('[ESPN] Error estado:', err.message);
      throw err;
    }
  },

  async getLineup(fixtureId, leagueSlug) {
    const league = leagueSlug || 'chi.1';
    const url = ESPN_BASE + '/' + league + '/summary?event=' + fixtureId;
    logger.info('[ESPN] alineacion fixture=' + fixtureId + ' liga=' + league);
    try {
      const r = await http.get(url);
      const rosters = r.data.rosters || [];
      if (rosters.length === 0) { logger.info('[ESPN] Sin alineacion aun'); return null; }
      const roster   = rosters[0];
      const starters = (roster.roster || [])
        .filter(p => p.starter)
        .map(p => (p.athlete && p.athlete.displayName) || 'Jugador');
      if (starters.length === 0) { logger.info('[ESPN] Titulares no publicados'); return null; }
      return {
        fixtureId,
        team:       (roster.team && roster.team.displayName) || '',
        formation:  (roster.formation && roster.formation.name) || 'N/D',
        startingXI: starters,
      };
    } catch (err) {
      logger.error('[ESPN] Error alineacion:', err.message);
      return null;
    }
  },

  _normalizeStatus(s) {
    return ({ STATUS_SCHEDULED:'NS', STATUS_IN_PROGRESS:'1H', STATUS_HALFTIME:'HT',
              STATUS_FULL_TIME:'FT', STATUS_FINAL:'FT', STATUS_POSTPONED:'PST',
              STATUS_CANCELED:'CANC', STATUS_SUSPENDED:'SUSP' })[s] || s;
  },

  async findTeamId(teamName, leagueSlug) {
    const league = leagueSlug || 'chi.1';
    const r = await http.get(ESPN_BASE + '/' + league + '/teams');
    const all = (r.data.sports && r.data.sports[0].leagues && r.data.sports[0].leagues[0].teams) || [];
    return all.map(t => t.team)
      .filter(t => t.displayName.toLowerCase().includes(teamName.toLowerCase()))
      .map(t => ({ id: t.id, name: t.displayName }));
  },
};

module.exports = FootballService;
