'use strict';

const axios  = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const http = axios.create({
  baseURL: config.whatsapp.baseUrl,
  headers: {
    Authorization: 'Bearer ' + config.whatsapp.token,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

function buildTemplateBody(to, templateName, variables) {
  const components = variables.length > 0
    ? [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: String(v) })) }]
    : [];
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\s/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: config.whatsapp.languageCode },
      components,
    },
  };
}

const WhatsAppService = {
  async sendPrematch(phone, { rival, hora, estadio }) {
    const body = buildTemplateBody(phone, config.whatsapp.templates.prematch, [rival, hora, estadio]);
    return WhatsAppService._send(body, 'prematch', phone);
  },

  async sendLineup(phone, { rival, jugadores }) {
    const body = buildTemplateBody(phone, config.whatsapp.templates.lineup, [rival, jugadores]);
    return WhatsAppService._send(body, 'lineup', phone);
  },

  async sendResult(phone, { golesLocal, golesVisita, rival }) {
    const body = buildTemplateBody(phone, config.whatsapp.templates.result, [golesLocal, golesVisita, rival]);
    return WhatsAppService._send(body, 'result', phone);
  },

  async _send(body, type, phone) {
    const endpoint = '/' + config.whatsapp.phoneNumberId + '/messages';
    try {
      const response = await http.post(endpoint, body);
      const msgId = response.data && response.data.messages && response.data.messages[0]
        ? response.data.messages[0].id : null;
      logger.info('[WhatsApp] ' + type + ' enviado a ' + phone + ' | msg_id=' + msgId);
      return { success: true, messageId: msgId };
    } catch (err) {
      const detail = (err.response && err.response.data) || err.message;
      logger.error('[WhatsApp] Error enviando ' + type + ' a ' + phone + ':', JSON.stringify(detail));
      throw err;
    }
  },
};

module.exports = WhatsAppService;
