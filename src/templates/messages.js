'use strict';

const config = require('../config');

function getTeamContext(fixture, teamId) {
  const esLocal = fixture.home.id === teamId;
  const rival   = esLocal ? fixture.away.name : fixture.home.name;
  return { esLocal, rival };
}

const templates = {
  prematch(fixture, teamId) {
    const { rival, esLocal } = getTeamContext(fixture, teamId);
    const hora = new Date(fixture.date).toLocaleTimeString('es-CL', {
      timeZone: config.timezone,
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const estadio = fixture.venue && fixture.venue.name
      ? fixture.venue.name + ', ' + fixture.venue.city
      : 'Estadio por confirmar';
    return { rival, hora, estadio, esLocal };
  },

  lineup(fixture, lineupData, teamId) {
    const { rival } = getTeamContext(fixture, teamId);
    const jugadores = lineupData.startingXI
      .map((nombre, i) => (i + 1) + '. ' + nombre)
      .join('\n');
    return { rival, jugadores: 'Formacion ' + lineupData.formation + '\n' + jugadores };
  },

  result(fixtureStatus, teamId) {
    const esLocal      = fixtureStatus.home && fixtureStatus.home.id
                         ? fixtureStatus.home.id === teamId
                         : true;
    const rival        = esLocal ? fixtureStatus.away.name : fixtureStatus.home.name;
    const golesNuestro = esLocal ? fixtureStatus.goals.home  : fixtureStatus.goals.away;
    const golesRival   = esLocal ? fixtureStatus.goals.away  : fixtureStatus.goals.home;
    return { golesLocal: golesNuestro || 0, golesVisita: golesRival || 0, rival, esLocal };
  },
};

module.exports = templates;
