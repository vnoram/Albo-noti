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

const WINDOW_OPEN_MIN  = 120;
const WINDOW_CLOSE_MIN = -15;

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

async function runLineup() {
  logger.info('=== JOB LINEUP iniciado ===');
  const today   = todayInChile();
  const teamIds = await UserRepository.getActiveTeamIds();

  for (const teamId of teamIds) {
    const ligas       = await UserRepository.getLeaguesForTeam(teamId);
    const subscribers = await UserRepository.getActiveSubscribers(teamId);
    const fixtures    = await getAllFixturesToday(teamId, today, ligas);

    for (const fixture of fixtures) {
      const min = minutesUntilMatch(fixture.date);
      logger.info('[' + (fixture.source||'espn') + '] #' + fixture.id + ': ' + min + ' min (' + fixture.league + ')');
      if (min > WINDOW_OPEN_MIN || min < WINDOW_CLOSE_MIN) continue;

      // Alineaciones solo via ESPN (SofaScore requiere suscripcion para lineups)
      if (fixture.source === 'sofascore') { logger.info('  Lineup N/A para SofaScore.'); continue; }

      const leagueSrc  = fixture.league.includes('.') ? fixture.league : 'chi.1';
      const lineupData = await FootballService.getLineup(fixture.id, leagueSrc);
      if (!lineupData) { logger.info('  No publicada.'); continue; }

      const msgData = templates.lineup(fixture, lineupData, teamId);
      for (const user of subscribers) {
        const yaEnviado = await NotificationRepository.exists(fixture.id, user.id, 'lineup', fixture.source);
        if (yaEnviado) continue;
        try {
          await WhatsAppService.sendLineup(user.phone, msgData);
          await NotificationRepository.register(fixture.id, user.id, 'lineup', fixture.source);
          logger.info('  ' + user.name + ': OK');
        } catch (err) { logger.error('  ' + user.name + ': ERROR ' + err.message); }
      }
    }
  }
  logger.info('=== JOB LINEUP finalizado ===');
}

runLineup()
  .catch(err => { logger.error('Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end());
