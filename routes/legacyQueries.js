const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import queries from '../util/queries';
import caching from '../util/caching';
import csv from '../util/csv';

/* See queries/*.sparql for the individual queries. Many of them return a large number of results, so subqueries had to be used to avoid a timeout */

const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://kaleidos-test.vlaanderen.be';

/* Oplijsten van alle mededelingen met een beslissing & verslag en hun bijhorend dossier */
router.get('/agendapunt-mededelingen-met-verslag', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunt_mededelingen_met_verslag.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.mededeling.substring(result.mededeling.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/beslissingen`;
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.dossier_url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van mededelingen die een "DOC" in de naam van de documenten hebben */
router.get('/mededelingen-met-DOC', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/mededelingen_met_DOC.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.mededeling.substring(result.mededeling.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agendapunten met een gelinkte mandataris en met een titel waar het woord “bekrachtiging” in staat */
router.get('/agendapunt-bekrachtiging-met-mandataris', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunt_bekrachtiging_met_mandataris.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
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
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle documenten verbonden aan een agendapunt met een titel waar het woord “bekrachtiging” in staat en die in Kaleidos niet publiek staan. */
router.get('/documenten-bekrachtiging-niet-publiek', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/documenten_bekrachtiging_niet_publiek.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiernamen met "goedkeuring" in de titel en daaronder resorterende agendapunt-titels */
router.get('/dossiers-goedkeuring', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/dossiers_goedkeuring.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiers waar een gestandardiseerde vorm van een procedurestapnaam in de titel staat */
router.get('/dossiers-titel-procedurestap', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/dossiers_titel_procedurestap.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten*/
router.get('/agendapunten-zonder-documenten', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten_zonder_documenten.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en met een beslissing */
router.get('/agendapunten-zonder-documenten-met-beslissing', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten_zonder_documenten_met_beslissing.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en zonder beslissing */
router.get('/agendapunten-zonder-documenten-zonder-beslissing', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten_zonder_documenten_zonder_beslissing.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van meetings waar er geen document ‘VR AGENDA …’ aan verbonden is */
router.get('/meetings-zonder-agenda-document', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/meetings_zonder_agenda_document.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agenda's met punten zonder titel */
router.get('/agendapunten-zonder-titel', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten_zonder_titel.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
    if (req.query && req.query.csv) {
      csv.sendCSV(results, req, res, `${name}.csv`);
    } else {
      res.send(results);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});


/* Oplijsten dubbele agendapunten (nummers of titel) */
// zitten normaal gezien in vorige lijst

export default router;
