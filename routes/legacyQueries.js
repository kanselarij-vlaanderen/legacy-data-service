const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import queries from '../util/queries';
import caching from '../util/caching';
import csv from '../util/csv';

/* See queries/*.sparql for the individual queries. Many of them return a large number of results, so subqueries had to be used to avoid a timeout */

const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

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

/* Oplijsten van agenda's waar er agendapunten met NaN als prioriteit in zitten */
router.get('/agendas-NaN', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendas_NaN.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten`;
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

const checkNumberSequence = function (items) {
  let wrongNumbers = [];
  let doubleNumbers = {};
  let previous = null;
  if (items) {
    // first sort the agenda items by priority number
    items.sort((a, b) => {
      if (+a.prioriteit > +b.prioriteit) {
        return 1;
      } else if (+a.prioriteit < +b.prioriteit) {
        return -1;
      }
      return 0;
    });
    // now check if the numbers are uninterrupted
    for (const agendapunt of items) {
      if (agendapunt.prioriteit === undefined) {
        wrongNumbers.push('missing a priority number for: ' + agendapunt.agendapunt);
      } else if (previous !== null && previous.prioriteit !== null && +agendapunt.prioriteit !== +previous.prioriteit + 1) {
        if (+agendapunt.prioriteit === +previous.prioriteit) {
          // store all doubles in an array in the doubleNumbers object, with the priority as a key
          if (!doubleNumbers[+agendapunt.prioriteit]) {
            doubleNumbers[+agendapunt.prioriteit] = [];
          }
          // make sure the previous one is not yet part of the list (in case of triples or quadruples)
          if (doubleNumbers[+agendapunt.prioriteit].indexOf(previous.agendapunt) === -1) {
            doubleNumbers[+agendapunt.prioriteit].push(previous.agendapunt);
          }
          if (doubleNumbers[+agendapunt.prioriteit].indexOf(agendapunt.agendapunt) === -1) {
            doubleNumbers[+agendapunt.prioriteit].push(agendapunt.agendapunt);
          }
        } else {
          wrongNumbers.push({ agendapunt: agendapunt.agendapunt, prioriteit: +agendapunt.prioriteit, missingNumber: +previous.prioriteit + 1 });
        }
      }
      if (agendapunt !== undefined) {
        previous = agendapunt;
      }
    }
  }
  return { wrongNumbers, doubleNumbers };
};

/* Oplijsten van agenda's waar er geen doorlopende nummering is van agendapunten */
router.get('/agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  // this query was optimized by removing all optionals, such as dct:title , since they significantly slowed down the query execution
  const query = await queries.getQueryFromFile('/app/queries/agendas_nummering.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
  try {
    let jsonResult = await caching.getLocalJSONFile(name);
    let results;
    if (jsonResult) {
      results = jsonResult;
    } else {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      console.log(`GET /${name}: ${results.length} results before filtering`);
      await caching.writeLocalFile(name, results);
    }
    // first group the results per agenda
    let agendas = {};
    for (const result of results) {
      if (result.agenda) {
        if (!agendas[result.agenda]) {
          agendas[result.agenda] = {
            agenda: result.agenda,
            titel: result.agendaTitel,
            geplandeStart: result.geplandeStart,
            meeting: result.meeting,
            agendapunten: []
          }
        }
        let agendapunt = {
          agendapunt: result.agendapunt,
          prioriteit: result.agendapuntPrioriteit
        };
        agendas[result.agenda].agendapunten.push(agendapunt);
      }
    }
    // now filter out the agenda's with uninterrupted numbers
    let filteredResults = [];
    for (const agendaUrl in agendas) {
      if (agendas.hasOwnProperty(agendaUrl)) {
        let { wrongNumbers, doubleNumbers } = checkNumberSequence(agendas[agendaUrl].agendapunten);
        if (wrongNumbers.length > 0 || Object.keys(doubleNumbers).length > 0) {
          if (wrongNumbers.length > 0) {
            agendas[agendaUrl].wrongNumbers = wrongNumbers;
          }
          if (Object.keys(doubleNumbers).length > 0) {
            agendas[agendaUrl].doubleNumbers = doubleNumbers;
          }
          filteredResults.push(agendas[agendaUrl]);
        }
      }
    }
    // generate urls
    for (const result of filteredResults) {
      if (result.meeting && result.agenda) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten`;
      }
    }
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(filteredResults, req, res, `${name}.csv`);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

const getFixableAgendas = async function () {
  const query = await queries.getQueryFromFile('/app/queries/agendas_nummering.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
  let jsonResult = await caching.getLocalJSONFile('agendas-nummering');
  let results;
  if (jsonResult) {
    results = jsonResult;
  } else {
    results = await kaleidosData.executeQuery(query, req.query.limit);
    console.log(`GET /${name}: ${results.length} results before filtering`);
    await caching.writeLocalFile(name, results);
  }
  // first group the results per agenda
  let agendas = {};
  for (const result of results) {
    if (result.agenda) {
      if (!agendas[result.agenda]) {
        agendas[result.agenda] = {
          agenda: result.agenda,
          titel: result.agendaTitel,
          geplandeStart: result.geplandeStart,
          meeting: result.meeting,
          agendapunten: []
        }
      }
      let agendapunt = {
        agendapunt: result.agendapunt,
        prioriteit: result.agendapuntPrioriteit
      };
      agendas[result.agenda].agendapunten.push(agendapunt);
    }
  }
  // now filter out the agenda's with uninterrupted numbers
  let filteredResults = [];
  for (const agendaUrl in agendas) {
    if (agendas.hasOwnProperty(agendaUrl)) {
      let { wrongNumbers, doubleNumbers } = checkNumberSequence(agendas[agendaUrl].agendapunten);
      if (wrongNumbers.length > 0) {
        agendas[agendaUrl].wrongNumbers = wrongNumbers;
        // check whether the missing numbers are in the mededelingen
        agendas[agendaUrl].mededelingen = {};
        agendas[agendaUrl].mededelingen.mededelingen = await kaleidosData.getMededelingenForAgenda(agendaUrl);
        let mededelingenSequence = checkNumberSequence(agendas[agendaUrl].mededelingen.mededelingen);
        agendas[agendaUrl].mededelingen.wrongNumbers = mededelingenSequence.wrongNumbers;
        agendas[agendaUrl].mededelingen.doubleNumbers = mededelingenSequence.doubleNumbers;
        let fixable = false;
        for (let wrongNumber of agendas[agendaUrl].wrongNumbers) {
          for (let wrongMededelingNumber of agendas[agendaUrl].mededelingen.wrongNumbers) {
            if (wrongNumber.missingNumber === wrongMededelingNumber.prioriteit) {
              fixable = true;
            }
          }
        }
        if (fixable && Object.keys(doubleNumbers).length === 0) {
          filteredResults.push(agendas[agendaUrl]);
        }
      }
    }
  }
  // generate urls
  for (const result of filteredResults) {
    if (result.meeting && result.agenda) {
      const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
      const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten`;
    }
  }
  return filteredResults;
};

/* Problems with the above we can automatically fix */
router.get('/fixable-agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    let filteredResults = await getFixableAgendas();
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(filteredResults, req, res, `${name}.csv`);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Problems with the above we can automatically fix */
router.get('/agendas-nummering-sparql-fix', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    let filteredResults = await getFixableAgendas();
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    let inserts = {};
    let deletes = {}
    let fixedAgendaUrls = [];
    for (const result of filteredResults) {
      for (const missing of result.wrongNumbers) {
        for (const potentialFix of result.mededelingen.wrongNumbers) {
          if (missing.missingNumber === potentialFix.prioriteit) {
            fixedAgendaUrls.push({ url: result.url, fixedNumber: missing.missingNumber });
            let originalTriple = `<${potentialFix.agendapunt}> ext:wordtGetoondAlsMededeling "true"^^tl:boolean .`;
            let graphs = await kaleidosData.getGraphsForTriple(originalTriple);
            if (graphs) {
              for (const graph of graphs) {
                if (graph.g) {
                  // make sure the graph list exists
                  if (!deletes[graph.g]) {
                    deletes[graph.g] = [];
                  }
                  if (!inserts[graph.g]) {
                    inserts[graph.g] = [];
                  }
                  deletes[graph.g].push(originalTriple);
                  inserts[graph.g].push(originalTriple.replace('"true"^^tl:boolean', '"false"^^tl:boolean'));
                }
              }
            }
          }
        }
      }
    }
    let finalSparqlString = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>\n`;
    let insertSparqlString = `INSERT DATA {\n`;
    let deleteSparqlString = `DELETE DATA {\n`;
    for (const graph in inserts) {
      if (inserts.hasOwnProperty(graph)) {
        insertSparqlString += `  GRAPH <${graph}> {\n`;
        for (const triple of inserts[graph]) {
          insertSparqlString += `    ${triple}\n`;
        }
        insertSparqlString += `  }\n`;
      }
    }
    for (const graph in deletes) {
      if (deletes.hasOwnProperty(graph)) {
        deleteSparqlString += `  GRAPH <${graph}> {\n`;
        for (const triple of deletes[graph]) {
          deleteSparqlString += `    ${triple}\n`;
        }
        deleteSparqlString += `  }\n`;
      }
    }
    deleteSparqlString += `}\n`;
    insertSparqlString += `}\n`;
    finalSparqlString += deleteSparqlString + insertSparqlString;
    let timestamp = new Date().toISOString().replace(/[-,T,:]/g, '').split('.')[0];
    const sparqlFile = `${SPARQL_EXPORT_FOLDER}${timestamp}-agendas-nummering.sparql`;
    await fsp.writeFile(path.resolve(sparqlFile), finalSparqlString);
    console.log('.sparql file generated at ' + sparqlFile);
    res.send({ fixedAgendas: fixedAgendaUrls });
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten dubbele agendapunten (nummers of titel) */
// zitten normaal gezien in vorige lijst

export default router;
