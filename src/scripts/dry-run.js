'use strict';

require('dotenv').config();

const FootballService  = require('../services/FootballService');
const SofaScoreService = require('../services/SofaScoreService');
const templates        = require('../templates/messages');
const logger           = require('../utils/logger');
const { minutesUntilMatch } = require('../utils/chileTime');
const config           = require('../config');

const TEAMS = [
  {
    teamId: config.football.coloColoTeamId,
    name:   'Colo-Colo',
    leagues: [
      { leagueSlug: 'chi.1' },
      { leagueSlug: 'conmebol.libertadores' },
      { leagueSlug: 'conmebol.sudamericana' },
    ],
  },
];

async function getAllFixturesToday(teamId, date, ligas) {
  const seen = new Map();
  const all  = [];
  const add = f => { const k = (f.source||'espn')+':'+f.id; if (!seen.has(k)) { seen.set(k,true); all.push(f); } };
  for (const { leagueSlug } of ligas) {
    (await FootballService.getMatchesToday(teamId, date, leagueSlug)).forEach(f => add({...f, source:'espn'}));
  }
  (await FootballService.getMatchesTodayAllComps(teamId, date)).forEach(f => add({...f, source:'espn'}));
  (await SofaScoreService.getMatchesToday(teamId, date)).forEach(f => {
    if (!seen.has('sofascore:'+f.id))
      logger.info('[SofaScore] Copa Chile detectada: #'+f.id+' '+f.home.name+' vs '+f.away.name);
    add(f);
  });
  return all;
}

const dateArg = process.argv[2];
const date    = dateArg || new Date().toISOString().slice(0, 10);

async function dryRun() {
  logger.info('=== DRY-RUN === fecha: ' + date);
  let totalPartidos = 0;

  for (const team of TEAMS) {
    logger.info('\nEquipo: ' + team.name + ' (id=' + team.teamId + ')');
    const fixtures = await getAllFixturesToday(team.teamId, date, team.leagues);
    if (fixtures.length === 0) { logger.info('  Sin partidos.'); continue; }
    totalPartidos += fixtures.length;

    for (const fixture of fixtures) {
      const src = fixture.source || 'espn';
      logger.info('  -- [' + src + '] #' + fixture.id + ': ' + fixture.home.name + ' vs ' + fixture.away.name);
      logger.info('     Competencia: ' + fixture.league);
      logger.info('     Estado: ' + fixture.status + ' | ' + fixture.venue.name + ', ' + fixture.venue.city);
      logger.info('     Fecha UTC: ' + fixture.date);
      const min = minutesUntilMatch(fixture.date);
      logger.info('     Minutos para inicio: ' + min);

      const prematchData = templates.prematch(fixture, team.teamId);
      logger.info('     [PREMATCH] rival=' + prematchData.rival + ' | hora=' + prematchData.hora + ' | estadio=' + prematchData.estadio);

      if (min <= 120 && min >= -15 && src === 'espn') {
        const leagueSrc = fixture.league.includes('.') ? fixture.league : 'chi.1';
        const lineupData = await FootballService.getLineup(fixture.id, leagueSrc);
        if (lineupData) {
          const msg = templates.lineup(fixture, lineupData, team.teamId);
          logger.info('     [LINEUP] rival=' + msg.rival);
        } else {
          logger.info('     [LINEUP] No publicada aun.');
        }
      }

      if (['FT','AET','PEN'].includes(fixture.status)) {
        let full;
        if (src === 'sofascore') {
          full = await SofaScoreService.getFixtureStatus(fixture.id);
        } else {
          const leagueSrc = fixture.league.includes('.') ? fixture.league : 'chi.1';
          full = await FootballService.getFixtureStatus(fixture.id, leagueSrc);
        }
        const r = templates.result(full, team.teamId);
        logger.info('     [RESULT] ' + r.golesLocal + '-' + r.golesVisita + ' vs ' + r.rival);
      }
    }
  }

  logger.info('\n=== DRY-RUN COMPLETO === ' + totalPartidos + ' partido(s)');
}

dryRun().catch(err => { logger.error('Error:', err.message); process.exit(1); });
