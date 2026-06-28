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

const FINISHED = new Set(['FT', 'AET', 'PEN']);

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

async function getCurrentStatus(fixture) {
  if (fixture.source === 'sofascore') return await SofaScoreService.getFixtureStatus(fixture.id);
  const leagueSrc = fixture.league.includes('.') ? fixture.league : 'chi.1';
  return await FootballService.getFixtureStatus(fixture.id, leagueSrc);
}

async function runResult() {
  logger.info('=== JOB RESULT iniciado ===');
  const today   = todayInChile();
  const teamIds = await UserRepository.getActiveTeamIds();

  for (const teamId of teamIds) {
    const ligas       = await UserRepository.getLeaguesForTeam(teamId);
    const subscribers = await UserRepository.getActiveSubscribers(teamId);
    const fixtures    = await getAllFixturesToday(teamId, today, ligas);

    for (const fixture of fixtures) {
      logger.info('[' + (fixture.source||'espn') + '] #' + fixture.id + ' (' + fixture.league + ')');
      try {
        const current = await getCurrentStatus(fixture);
        logger.info('  Estado: ' + current.status + ' | ' + current.goals.home + '-' + current.goals.away);
        if (!FINISHED.has(current.status)) { logger.info('  No terminado.'); continue; }

        const msgData = templates.result(current, teamId);
        for (const user of subscribers) {
          const yaEnviado = await NotificationRepository.exists(fixture.id, user.id, 'result', fixture.source);
          if (yaEnviado) continue;
          try {
            await WhatsAppService.sendResult(user.phone, msgData);
            await NotificationRepository.register(fixture.id, user.id, 'result', fixture.source);
            logger.info('  ' + user.name + ': OK');
          } catch (err) { logger.error('  ' + user.name + ': ERROR ' + err.message); }
        }
      } catch (err) { logger.error('  Error estado fixture #' + fixture.id + ':', err.message); }
    }
  }
  logger.info('=== JOB RESULT finalizado ===');
}

runResult()
  .catch(err => { logger.error('Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end());
