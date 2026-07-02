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
const { todayInChile, minutesUntilMatch } = require('../utils/chileTime');

// Ventana: envia cuando faltan entre 45 y 90 minutos
const WINDOW_OPEN_MIN  = 90;
const WINDOW_CLOSE_MIN = 45;

async function getAllFixturesToday(teamId, date, ligas) {
  const seen = new Map();
  const all  = [];
  const add = f => { const k = (f.source||'espn')+':'+f.id; if (!seen.has(k)) { seen.set(k,true); all.push(f); } };
  for (const { leagueSlug } of ligas) {
    (await FootballService.getMatchesToday(teamId, date, leagueSlug)).forEach(f => add({...f, source:'espn'}));
  }
  (await FootballService.getMatchesTodayAllComps(teamId, date)).forEach(f => add({...f, source:'espn'}));
  (await SofaScoreService.getMatchesToday(teamId, date)).forEach(f => add(f));
  return all;
}

async function runReminder() {
  logger.info('=== JOB REMINDER iniciado ===');
  const today   = todayInChile();
  const teamIds = await UserRepository.getActiveTeamIds();

  for (const teamId of teamIds) {
    const ligas       = await UserRepository.getLeaguesForTeam(teamId);
    const subscribers = await UserRepository.getActiveSubscribers(teamId);
    const fixtures    = await getAllFixturesToday(teamId, today, ligas);

    for (const fixture of fixtures) {
      const min = minutesUntilMatch(fixture.date);
      logger.info('[' + (fixture.source||'espn') + '] #' + fixture.id + ': ' + min + ' min para el partido');

      if (min > WINDOW_OPEN_MIN || min < WINDOW_CLOSE_MIN) {
        logger.info('  Fuera de ventana (' + WINDOW_CLOSE_MIN + '-' + WINDOW_OPEN_MIN + ' min). Saltando.');
        continue;
      }

      const data = templates.prematch(fixture, teamId);

      for (const user of subscribers) {
        const yaEnviado = await NotificationRepository.exists(fixture.id, user.id, 'reminder', fixture.source);
        if (yaEnviado) { logger.info('  ' + user.name + ': ya enviado.'); continue; }
        try {
          await WhatsAppService.sendReminder(user.phone, data);
          await NotificationRepository.register(fixture.id, user.id, 'reminder', fixture.source);
          logger.info('  ' + user.name + ': OK');
        } catch (err) { logger.error('  ' + user.name + ': ERROR ' + err.message); }
      }
    }
  }
  logger.info('=== JOB REMINDER finalizado ===');
}

runReminder()
  .catch(err => { logger.error('Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end());
