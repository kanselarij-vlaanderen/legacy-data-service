import { app, errorHandler } from 'mu';
import jsonParser from './util/jsonParser';
import kaleidosData from './util/kaleidosData';
import { promises as fsp } from 'fs';
import * as path from 'path';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = 'http://localhost';

const getQueryFromFile = async function (queryPath) {
  let filePath = path.resolve(queryPath);
  let results = [];
  try {
    let localFile = await fsp.readFile(filePath, 'utf8');
    return localFile;
  } catch (e) {
    console.log(e);
  }
  return results;
};

const generateCSV = function (headers, data) {
  let csvString = ``;
  for (const header of headers) {
    csvString += `${header};`;
  }
  csvString += `\n`;
  for (const item of data) {
    for (const key in item) {
      if (item.hasOwnProperty(key)) {
        csvString += `${item[key]};`;
      }
    }
    csvString += `\n`;
  }
  csvString = csvString.replace(/undefined/g, '');
  return csvString;
};

const sendCSV = function (results, req, res) {
  let csvString = '';
  if (results && results.length) {
    let headers = [];
    for (const key in results[0]) {
      if (results[0].hasOwnProperty(key)) {
        headers.push(key);
      }
    }
    csvString = generateCSV(headers, results);
  }
  res.send(csvString);
}

/* See queries/*.sparql for the individual queries. Many of them return a large number of results, so subqueries had to be used to avoid a timeout */

/* Oplijsten van alle mededelingen met een beslissing & verslag en hun bijhorend dossier */
app.get('/agendapunt-mededelingen-met-verslag', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/agendapunt_mededelingen_met_verslag.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.mededeling.substring(result.mededeling.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/beslissingen`;
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      result.dossier_url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
    }
    console.log(`GET /agendapunt-mededelingen-met-verslag: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van mededelingen die een "DOC" in de naam van de documenten hebben */
app.get('/mededelingen-met-DOC', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/mededelingen_met_DOC.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.mededeling.substring(result.mededeling.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
    }
    console.log(`GET /mededelingen-met-DOC: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agendapunten met een gelinkte mandataris en met een titel waar het woord “bekrachtiging” in staat */
app.get('/agendapunt-bekrachtiging-met-mandataris', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/agendapunt_bekrachtiging_met_mandataris.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls and get mandataris data
    for (const result of results) {
      if (result.mandataris) {
        let kaleidosMandatarisData = kaleidosData.getMandataris(result.mandataris);
        let mandataris = kaleidosMandatarisData.kanselarij || kaleidosMandatarisData.public;
        if (mandataris) {
          result.mandataris_naam = mandataris.name;
          result.mandataris_titel = mandataris.titel;
          result.mandataris_voornaam = mandataris.firstName;
          result.mandataris_familienaam = mandataris.familyName;
        }
      }
      const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
    }
    console.log(`GET /agendapunt-bekrachtiging-met-mandataris: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle documenten verbonden aan een agendapunt met een titel waar het woord “bekrachtiging” in staat en die in Kaleidos niet publiek staan. */
app.get('/documenten-bekrachtiging-niet-publiek', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/documenten_bekrachtiging_niet_publiek.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
    }
    console.log(`GET /documenten-bekrachtiging-niet-publiek: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiernamen met "goedkeuring" in de titel en daaronder resorterende agendapunt-titels */
app.get('/dossiers-goedkeuring', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/dossiers_goedkeuring.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
    }
    console.log(`GET /dossiers-goedkeuring: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiers waar een gestandardiseerde vorm van een procedurestapnaam in de titel staat */
app.get('/dossiers-titel-procedurestap', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/dossiers_titel_procedurestap.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
    }
    console.log(`GET /dossiers-goedkeuring: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten*/
app.get('/agendapunten-zonder-documenten', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
    }
    console.log(`GET /agendapunten-zonder-documenten: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en met een beslissing */
app.get('/agendapunten-zonder-documenten-met-beslissing', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten_met_beslissing.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
    }
    console.log(`GET /agendapunten-zonder-documenten-met-beslissing: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en zonder beslissing */
app.get('/agendapunten-zonder-documenten-zonder-beslissing', async function(req, res) {
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten_zonder_beslissing.sparql');
  try {
    let results = await kaleidosData.executeQuery(query, req.query.limit);
    // generate urls
    for (const result of results) {
      const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
    }
    console.log(`GET /agendapunten-zonder-documenten-zonder-beslissing: ${results.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(results, req, res);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

//TODO

/* Oplijsten van agenda's waar er geen doorlopende nummering is van agendapunten */

/* Oplijsten van agenda's waar er geen Word agenda is */

/* Oplijsten van agenda's met punten zonder titel */

/* Oplijsten dubbele agendapunten (nummers of titel) */

app.use(errorHandler);
