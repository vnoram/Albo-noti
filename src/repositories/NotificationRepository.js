'use strict';

const pool = require('../db/pool');

const NotificationRepository = {
  /**
   * @param {number|string} fixtureId
   * @param {number}        userId
   * @param {string}        type   prematch|lineup|result
   * @param {string}        source espn|sofascore (default: espn)
   */
  async exists(fixtureId, userId, type, source) {
    const src = source || 'espn';
    const result = await pool.query(
      `SELECT 1 FROM sent_notifications
       WHERE source=$1 AND fixture_id=$2 AND user_id=$3 AND type=$4
       LIMIT 1`,
      [src, fixtureId, userId, type]
    );
    return result.rowCount > 0;
  },

  async register(fixtureId, userId, type, source) {
    const src = source || 'espn';
    await pool.query(
      `INSERT INTO sent_notifications (source, fixture_id, user_id, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source, fixture_id, user_id, type) DO NOTHING`,
      [src, fixtureId, userId, type]
    );
  },
};

module.exports = NotificationRepository;
