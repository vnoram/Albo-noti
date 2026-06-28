'use strict';

/**
 * 🧪 TEST: Verificación de WhatsApp Cloud API
 * ─────────────────────────────────────────────────────────────────────────────
 * Envía un mensaje de plantilla REAL a un número para confirmar que
 * las credenciales y las plantillas están configuradas correctamente.
 *
 * Uso:
 *   node src/scripts/test-whatsapp.js
 *
 * Requiere en .env:
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *   WA_TEMPLATE_PREMATCH (o el nombre que hayas puesto)
 *   TEST_PHONE=+56912345678  ← tu propio número para recibir el test
 *
 * Si el mensaje llega: ✅ WhatsApp está 100% listo.
 * Si falla: el error de Meta te dirá exactamente qué falta.
 */

require('dotenv').config();

const WhatsAppService = require('../services/WhatsAppService');
const logger          = require('../utils/logger');

// Número que recibirá el mensaje de prueba (puede ser el tuyo propio)
const TEST_PHONE = process.env.TEST_PHONE;
if (!TEST_PHONE) {
  console.error('\n❌ Agrega TEST_PHONE=+56912345678 a tu .env y vuelve a correr.\n');
  process.exit(1);
}

async function main() {
  console.log('\n🧪 Test de WhatsApp Cloud API');
  console.log('─────────────────────────────────');
  console.log(`📱 Enviando a: ${TEST_PHONE}`);
  console.log(`📋 Plantilla:  ${process.env.WA_TEMPLATE_PREMATCH || 'colocolo_prematch'}`);
  console.log('─────────────────────────────────\n');

  try {
    // Enviamos un prematch de prueba con datos ficticios
    const result = await WhatsAppService.sendPrematch(TEST_PHONE, {
      rival:   'Universidad de Chile',  // {{1}}
      hora:    '19:00',                  // {{2}}
      estadio: 'Estadio Monumental',    // {{3}}
    });

    console.log('\n✅ ¡Mensaje enviado correctamente!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log('\n   Revisa tu WhatsApp — debería llegar en segundos.\n');
  } catch (err) {
    console.error('\n❌ Error al enviar:');

    // Mostrar el error de Meta de forma legible
    if (err.response?.data) {
      const meta = err.response.data;
      console.error('   Código:', meta.error?.code);
      console.error('   Mensaje:', meta.error?.message);
      console.error('   Sub-código:', meta.error?.error_subcode);
      console.error('\n   Causas comunes:');
      console.error('   • Token vencido → regenerar en Meta for Developers');
      console.error('   • Plantilla no aprobada → revisar en Meta → Plantillas');
      console.error('   • Número no verificado → agregarlo en Meta → Números de prueba');
      console.error('   • Phone Number ID incorrecto → verificar en Meta → Configuración API\n');
    } else {
      console.error('  ', err.message);
    }
    process.exit(1);
  }
}

main();
