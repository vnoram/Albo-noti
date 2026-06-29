'use strict';

require('dotenv').config();
const pool   = require('./pool');
const config = require('../config');
const logger = require('../utils/logger');

const INITIAL_USER = {
  name:  process.env.INITIAL_USER_NAME  || 'Papa',
  phone: process.env.INITIAL_USER_PHONE || '+56912345678',
};

// Ligas ESPN donde aparece Colo-Colo
// Agregar o quitar segun la temporada
const COLOCOLO_LEAGUES = [
  { slug: 'chi.1',                 name: 'Primera Division' },
  { slug: 'chi.copa_chi',          name: 'Copa Chile' },
  { slug: 'conmebol.libertadores', name: 'Copa Libertadores' },
  { slug: 'conmebol.sudamericana', name: 'Copa Sudamericana' },
];

async function seed() {
  const client = await pool.connect();
  try {
    logger.info('Usuario: ' + INITIAL_USER.name + ' (' + INITIAL_USER.phone + ')');

    const userResult = await client.query(
      `INSERT INTO users (name, phone)
       VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, phone`,
      [INITIAL_USER.name, INITIAL_USER.phone]
    );
    const user = userResult.rows[0];
    logger.info('  id=' + user.id);

    await client.query(
      `INSERT INTO subscriptions (user_id, team_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT DO NOTHING`,
      [user.id, config.football.coloColoTeamId]
    );
    logger.info('  Suscripcion a Colo-Colo (team_id=' + config.football.coloColoTeamId + ')');

    // Limpiar ligas obsoletas
    await client.query(
      `DELETE FROM team_leagues WHERE team_id=$1 AND league_slug NOT IN (${COLOCOLO_LEAGUES.map((_,i)=>'$'+(i+2)).join(',')})`,
      [config.football.coloColoTeamId, ...COLOCOLO_LEAGUES.map(l=>l.slug)]
    );

    // Registrar ligas de Colo-Colo
    for (const liga of COLOCOLO_LEAGUES) {
      await client.query(
        `INSERT INTO team_leagues (team_id, league_slug, team_name)
         VALUES ($1, $2, 'Colo Colo')
         ON CONFLICT (team_id, league_slug) DO NOTHING`,
        [config.football.coloColoTeamId, liga.slug]
      );
      logger.info('  Liga: ' + liga.name + ' (' + liga.slug + ')');
    }

    logger.info('Seed completado.');
  } catch (err) {
    logger.error('Error en seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
