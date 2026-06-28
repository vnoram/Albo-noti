'use strict';

const pool = require('../db/pool');

const UserRepository = {
  async getActiveSubscribers(teamId) {
    const result = await pool.query(
      `SELECT u.id, u.name, u.phone
       FROM users u
       JOIN subscriptions s ON s.user_id = u.id
       WHERE s.team_id = $1 AND s.status = 'active'
       ORDER BY u.id`,
      [teamId]
    );
    return result.rows;
  },

  async getActiveTeamIds() {
    const result = await pool.query(
      `SELECT DISTINCT team_id FROM subscriptions WHERE status = 'active' ORDER BY team_id`
    );
    return result.rows.map(r => r.team_id);
  },

  /**
   * Retorna las ligas ESPN configuradas para un equipo.
   * Si no hay ninguna configurada, devuelve ['chi.1'] como fallback.
   * @param {number} teamId
   * @returns {Promise<Array<{leagueSlug, teamName}>>}
   */
  async getLeaguesForTeam(teamId) {
    const result = await pool.query(
      `SELECT league_slug, team_name FROM team_leagues WHERE team_id = $1 ORDER BY id`,
      [teamId]
    );
    if (result.rows.length === 0) {
      return [{ leagueSlug: 'chi.1', teamName: null }];
    }
    return result.rows.map(r => ({ leagueSlug: r.league_slug, teamName: r.team_name }));
  },

  /**
   * Agrega una liga a monitorear para un equipo.
   * Ejemplo: addLeagueToTeam(2688, 'chi.2', 'Colo Colo')
   */
  async addLeagueToTeam(teamId, leagueSlug, teamName) {
    await pool.query(
      `INSERT INTO team_leagues (team_id, league_slug, team_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, league_slug) DO UPDATE SET team_name = EXCLUDED.team_name`,
      [teamId, leagueSlug, teamName || null]
    );
  },

  async addSubscriber({ name, phone, teamId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (name, phone) VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name, phone]
      );
      const userId = userResult.rows[0].id;
      await client.query(
        `INSERT INTO subscriptions (user_id, team_id, status) VALUES ($1, $2, 'active')
         ON CONFLICT DO NOTHING`,
        [userId, teamId]
      );
      await client.query('COMMIT');
      return userId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = UserRepository;
