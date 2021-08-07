import { app, errorHandler } from 'mu';
import jsonParser from './util/jsonParser';
import kaleidosData from './util/kaleidosData';
import { promises as fsp } from 'fs';
import * as path from 'path';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = 'http://localhost';
const CSV_EXPORT_FOLDER = '/data/legacy/';
const JSON_EXPORT_FOLDER = '/data/legacy/';

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
  // add the headers
  for (const header of headers) {
    csvString += `${header};`;
  }
  // remove the last semicolon
  csvString = csvString.replace(/undefined/g, '');
  csvString += `\n`;
  // add the data
  for (const item of data) {
    for (const header of headers) {
      if (item.hasOwnProperty(header)) {
        if (typeof item[header] === 'object') {
          csvString += `"${JSON.stringify(item[header])}";`;
        } else if (item[header] !== undefined && item[header].indexOf('http') === 0) {
          csvString += `${item[header]};`;
        } else {
          if (item[header] !== undefined && item[header].indexOf('"') > -1) {
            console.log('WARNING: data contains double quotes which were replaced by single quotes');
            item[header] = item[header].replace(/"/g, '\'');
          }
          csvString += `"${item[header]}";`;
        }
      } else {
        csvString += ';';
      }
    }
    // remove the last semicolon
    csvString = csvString.substring(0, csvString.length - 1);
    csvString += `\n`;
  }
  csvString = csvString.replace(/undefined/g, '');
  return csvString;
};

const sendCSV = async function (results, req, res, fileSuffix) {
  if (!fileSuffix) {
    fileSuffix = 'results.csv';
  }
  let csvString = '';
  if (results && results.length) {
    let headers = [];
    for (const key in results[0]) {
      if (results[0].hasOwnProperty(key)) {
        // make sure data urls are pushed to the last columns for clarity
        if (results[0][key] !== undefined && results[0][key].indexOf('http') === 0 && results[0][key].indexOf(BASE_URL) === -1) {
          headers.push(key);
        } else {
          headers.splice(0, 0, key);
        }
      }
    }
    csvString = generateCSV(headers, results);
  }
  await fsp.writeFile(path.resolve(CSV_EXPORT_FOLDER + fileSuffix), csvString);
  res.send('CSV generated at ' + path.resolve(CSV_EXPORT_FOLDER + fileSuffix));
};

const getLocalJSONFile = async function (name) {
  let localFile;
  let filePath = path.resolve(JSON_EXPORT_FOLDER + '/' + name + '.json');
  try {
    localFile = await fsp.readFile(filePath);
  } catch (e) {
    console.log('No local file found at ' + filePath);
    return null;
  }
  if (localFile) {
    console.log('Local file found at ' + filePath);
    return JSON.parse(localFile);
  } else {
    return null;
  }
};

const writeLocalFile = async function (name, data) {
  let filePath = path.resolve(JSON_EXPORT_FOLDER + '/' + name + '.json');
  await fsp.writeFile(filePath, JSON.stringify(data));
  console.log('Local file written to ' + filePath);
};


const getMededelingenForAgenda = async function (agendaUrl) {
  const getQuery = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>

select DISTINCT ?agendapunt ?prioriteit WHERE {
 <${agendaUrl}> dct:hasPart ?agendapunt .
 ?agendapunt ext:wordtGetoondAlsMededeling "true"^^tl:boolean .
 ?agendapunt ext:prioriteit  ?prioriteit .
} ORDER BY ?prioriteit`;
  let results = await kaleidosData.executeQuery(getQuery);
  if (results && results.length) {
    // sort the results by priority number
    results.sort((a, b) => {
      if (+a.prioriteit > +b.prioriteit) {
        return 1;
      } else if (+a.prioriteit < +b.prioriteit) {
        return -1;
      }
      return 0;
    });
  }
  return results;
};

/* See queries/*.sparql for the individual queries. Many of them return a large number of results, so subqueries had to be used to avoid a timeout */

/* Oplijsten van alle mededelingen met een beslissing & verslag en hun bijhorend dossier */
app.get('/agendapunt-mededelingen-met-verslag', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunt_mededelingen_met_verslag.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
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
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van mededelingen die een "DOC" in de naam van de documenten hebben */
app.get('/mededelingen-met-DOC', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/mededelingen_met_DOC.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.mededeling.substring(result.mededeling.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agendapunten met een gelinkte mandataris en met een titel waar het woord “bekrachtiging” in staat */
app.get('/agendapunt-bekrachtiging-met-mandataris', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunt_bekrachtiging_met_mandataris.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
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
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle documenten verbonden aan een agendapunt met een titel waar het woord “bekrachtiging” in staat en die in Kaleidos niet publiek staan. */
app.get('/documenten-bekrachtiging-niet-publiek', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/documenten_bekrachtiging_niet_publiek.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiernamen met "goedkeuring" in de titel en daaronder resorterende agendapunt-titels */
app.get('/dossiers-goedkeuring', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/dossiers_goedkeuring.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle dossiers waar een gestandardiseerde vorm van een procedurestapnaam in de titel staat */
app.get('/dossiers-titel-procedurestap', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/dossiers_titel_procedurestap.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten*/
app.get('/agendapunten-zonder-documenten', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en met een beslissing */
app.get('/agendapunten-zonder-documenten-met-beslissing', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten_met_beslissing.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van alle agendapunten zonder documenten en zonder beslissing */
app.get('/agendapunten-zonder-documenten-zonder-beslissing', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_documenten_zonder_beslissing.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van meetings waar er geen document ‘VR AGENDA …’ aan verbonden is */
app.get('/meetings-zonder-agenda-document', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/meetings_zonder_agenda_document.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/documenten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agenda's met punten zonder titel */
app.get('/agendapunten-zonder-titel', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendapunten_zonder_titel.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const agendapuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten van agenda's waar er agendapunten met NaN als prioriteit in zitten */
app.get('/agendas-NaN', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await getQueryFromFile('/app/queries/agendas_NaN.sparql');
  try {
    let jsonResult = await getLocalJSONFile(name);
    if (jsonResult) {
      res.send(jsonResult);
    } else {
      let results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await writeLocalFile(name, results);
      if (req.query && req.query.csv) {
        sendCSV(results, req, res, `${name}.csv`);
      } else {
        res.send(results);
      }
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
app.get('/agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  // this query was optimized by removing all optionals, such as dct:title , since they significantly slowed down the query execution
  const query = await getQueryFromFile('/app/queries/agendas_nummering.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
  try {
    let jsonResult = await getLocalJSONFile(name);
    let results;
    if (jsonResult) {
      results = jsonResult;
    } else {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      console.log(`GET /${name}: ${results.length} results before filtering`);
      await writeLocalFile(name, results);
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
      sendCSV(filteredResults, req, res, `${name}.csv`);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Problems with the above we can automatically fix */
app.get('/fixable-agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  // this query was optimized by removing all optionals, such as dct:title , since they significantly slowed down the query execution
  const query = await getQueryFromFile('/app/queries/agendas_nummering.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
  try {
    let jsonResult = await getLocalJSONFile('agendas-nummering');
    let results;
    if (jsonResult) {
      results = jsonResult;
    } else {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      console.log(`GET /${name}: ${results.length} results before filtering`);
      await writeLocalFile(name, results);
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
          agendas[agendaUrl].mededelingen.mededelingen = await getMededelingenForAgenda(agendaUrl);
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
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    if (req.query && req.query.csv) {
      sendCSV(filteredResults, req, res, `${name}.csv`);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten dubbele agendapunten (nummers of titel) */
// zitten normaal gezien in vorige lijst

app.use(errorHandler);
