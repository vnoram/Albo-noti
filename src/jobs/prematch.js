'use strict';

require('dotenv').config();

const pool                   = require('../db/pool');
const FootballService        = require('../services/FootballService');
const SofaScoreService       = require('../services/SofaScoreService');
const WhatsAppService        = require('../services/WhatsAppService');
const UserRepository         = require('../repositories/UserRepository');
const NotificationRepository = require('../repositories/NotificationRepository');
const templates              = require('../templates/messages');
const logger                 = require('../utils/logger');
const { todayInChile }       = require('../utils/chileTime');

/**
 * Lee la variable COPA_CHILE_FIXTURES y retorna partidos de hoy.
 * Formato (separados por ; para multiples partidos):
 *   FECHA,RIVAL,HORA_SANTIAGO,ESTADIO,local_o_visita
 * Ejemplo:
 *   2026-06-29,Unión Española,19:30,Estadio Santa Laura,away
 *   2026-07-15,Deportes Limache,20:00,Estadio Monumental,home
 */
function getManualFixturesToday(teamId, date) {
  const raw = (process.env.COPA_CHILE_FIXTURES || '').trim();
  if (!raw) return [];

  const fixtures = [];
  for (const entry of raw.split(';')) {
    const parts = entry.trim().split(',');
    if (parts.length < 5) continue;
    const [fixtureDate, rival, timeChile, venue, position] = parts.map(p => p.trim());
    if (fixtureDate !== date) continue;

    const isHome   = position.toLowerCase() === 'home';
    const teamIdNum = parseInt(teamId, 10);
    const fixtureId = 'manual_' + fixtureDate + '_' + rival.replace(/[^a-zA-Z0-9]/g, '_');

    fixtures.push({
      id:     fixtureId,
      source: 'manual',
      date:   new Date(fixtureDate + 'T' + timeChile + ':00-04:00').toISOString(),
      league: 'Copa Chile',
      status: 'NS',
      home:   isHome ? { id: teamIdNum, name: 'Colo-Colo' } : { id: 0, name: rival },
      away:   isHome ? { id: 0, name: rival } : { id: teamIdNum, name: 'Colo-Colo' },
      venue:  { name: venue, city: '' },
      goals:  { home: null, away: null },
    });
    logger.info('[Manual] Copa Chile: ' + (isHome ? 'Colo-Colo' : rival) + ' vs ' + (isHome ? rival : 'Colo-Colo') + ' a las ' + timeChile);
  }
  return fixtures;
}

async function getAllFixturesToday(teamId, date, ligas) {
  const seen = new Map();
  const all  = [];
  const add = f => { const k = (f.source||'espn')+':'+f.id; if (!seen.has(k)) { seen.set(k,true); all.push(f); } };
  for (const { leagueSlug } of ligas) {
    (await FootballService.getMatchesToday(teamId, date, leagueSlug)).forEach(f => add({...f, source:'espn'}));
  }
  (await FootballService.getMatchesTodayAllComps(teamId, date)).forEach(f => add({...f, source:'espn'}));
  (await SofaScoreService.getMatchesToday(teamId, date)).forEach(f => {
    if (!seen.has('sofascore:'+f.id)) logger.info('[SofaScore] Copa Chile: #'+f.id+' '+f.home.name+' vs '+f.away.name);
    add(f);
  });
  getManualFixturesToday(teamId, date).forEach(f => add(f));
  return all;
}

async function runPrematch() {
  logger.info('=== JOB PREMATCH iniciado ===');
  const today   = todayInChile();
  const teamIds = await UserRepository.getActiveTeamIds();
  logger.info('Equipos: [' + teamIds.join(', ') + '] | Fecha: ' + today);

  for (const teamId of teamIds) {
    const ligas       = await UserRepository.getLeaguesForTeam(teamId);
    const subscribers = await UserRepository.getActiveSubscribers(teamId);
    const fixtures    = await getAllFixturesToday(teamId, today, ligas);
    logger.info('Equipo ' + teamId + ': ' + fixtures.length + ' partido(s) | ' + subscribers.length + ' suscriptor(es)');

    for (const fixture of fixtures) {
      logger.info('[' + (fixture.source||'espn') + '] #' + fixture.id + ': ' + fixture.home.name + ' vs ' + fixture.away.name + ' (' + fixture.league + ')');
      const data = templates.prematch(fixture, teamId);
      for (const user of subscribers) {
        const yaEnviado = await NotificationRepository.exists(fixture.id, user.id, 'prematch', fixture.source);
        if (yaEnviado) { logger.info('  ' + user.name + ': ya enviado.'); continue; }
        try {
          await WhatsAppService.sendPrematch(user.phone, data);
          await NotificationRepository.register(fixture.id, user.id, 'prematch', fixture.source);
          logger.info('  ' + user.name + ': OK');
        } catch (err) { logger.error('  ' + user.name + ': ERROR ' + err.message); }
      }
    }
  }
  logger.info('=== JOB PREMATCH finalizado ===');
}

runPrematch()
  .catch(err => { logger.error('Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end());
