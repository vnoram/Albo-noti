'use strict';

require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error('Variable de entorno requerida no configurada: ' + name);
  return value;
}

const config = {
  database: {
    url: requireEnv('DATABASE_URL'),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  football: {
    // ESPN IDs (sin API key - gratis)
    // Colo-Colo = 2688, U de Chile = 2689, U Catolica = 885
    coloColoTeamId: parseInt(process.env.COLOCOLO_TEAM_ID || '2688', 10),
    espnLeague:     process.env.ESPN_LEAGUE || 'chi.1',
    season:         parseInt(process.env.SEASON || new Date().getFullYear(), 10),
  },

  whatsapp: {
    token:         process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    baseUrl:       'https://graph.facebook.com/v23.0',
    templates: {
      prematch: process.env.WA_TEMPLATE_PREMATCH || 'colocolo_prematch',
      lineup:   process.env.WA_TEMPLATE_LINEUP   || 'colocolo_lineup',
      result:   process.env.WA_TEMPLATE_RESULT   || 'colocolo_result',
    },
    languageCode: 'es',
  },

  timezone: 'America/Santiago',
  env: process.env.NODE_ENV || 'development',
};

module.exports = config;
