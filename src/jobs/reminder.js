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

// Ventana: envia cuando falta entre 45 y 75 minutos (~1 hora antes).
// Ancho de 30 min = mismo intervalo del cron -> garantiza exactamente 1 corrida
// dentro de la ventana por partido, sin importar el minuto exacto del kickoff.
const WINDOW_OPEN_MIN  = 75;
const WINDOW_CLOSE_MIN = 45;

async function getAllFixturesToday(teamId, date, ligas) {
  const seen = new Map();
  const all  = [];
  // Dedupe por el PAR de equipos (no por id+fuente): ESPN y SofaScore
  // reportan el mismo partido real con IDs distintos, y antes se contaban
  // como 2 partidos separados -> se enviaba el recordatorio 2 veces.
  // Se conserva la primera fuente que lo encuentre (ESPN tiene prioridad
  // porque se consulta primero).
  const add = f => {
    const k = [f.home.id, f.away.id].sort((a, b) => a - b).join('-');
    if (!seen.has(k)) { seen.set(k, true); all.push(f); }
  };
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
        // Reclamar ANTES de enviar (atomico via UNIQUE + ON CONFLICT).
        // Si dos corridas de cron caen casi al mismo tiempo, solo una gana
        // la reclamacion y por lo tanto solo una manda el WhatsApp.
        const gane = await NotificationRepository.claim(fixture.id, user.id, 'reminder', fixture.source);
        if (!gane) { logger.info('  ' + user.name + ': ya enviado (o en curso).'); continue; }
        try {
          await WhatsAppService.sendReminder(user.phone, data);
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
