'use strict';

/**
 * Script de utilidad para descubrir los IDs correctos de API-Football.
 * Ejecutar UNA SOLA VEZ, anotar los IDs y guardarlos en las variables de entorno.
 *
 * Uso: node src/scripts/find-ids.js
 */

require('dotenv').config();
const FootballService = require('../services/FootballService');

async function main() {
  console.log('\n🔍 Buscando Colo-Colo...\n');
  const teams = await FootballService.findTeamId('Colo Colo');
  const coloColo = teams.filter(t => t.country === 'Chile');
  console.table(coloColo);

  console.log('\n🔍 Buscando ligas de Chile...\n');
  const leagues = await FootballService.findLeagueId('Chile');
  const relevant = leagues.filter(l => ['League', 'Cup'].includes(l.type));
  console.table(relevant);

  console.log('\n✅ Anota los IDs correctos y actualiza tus variables de entorno:');
  console.log('   COLOCOLO_TEAM_ID=<id de Colo-Colo>');
  console.log('   LEAGUE_ID=<id de la Primera División>');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
