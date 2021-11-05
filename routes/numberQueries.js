const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import queries from '../util/queries';
import caching from '../util/caching';
import csv from '../util/csv';
import dorisMetadata from '../util/dorisMetadata';

const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://kaleidos-test.vlaanderen.be';

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
      await caching.writeLocalFile(name, results);
    }
    console.log(`GET /${name}: ${results.length} results`);
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

const getAgendasWithFaultyNumbers = async function (req) {
  let name = 'agendas-nummering';
  const query = await queries.getQueryFromFile('/app/queries/agendas_nummering.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
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
        let title = result.title;
        if (!title && result.geplandeStart) {
          let startDate = new Date(result.geplandeStart);
          title = 'Agenda van ' + startDate.toLocaleString('nl-BE', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        agendas[result.agenda] = {
          agenda: result.agenda,
          titel: title,
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
          agendas[agendaUrl].missingNumbers = '';
          for (const wrongNumber of wrongNumbers) {
            if (wrongNumber.missingNumber) {
              agendas[agendaUrl].missingNumbers += `${wrongNumber.missingNumber}, `;
            }
          }
        }
        if (Object.keys(doubleNumbers).length > 0) {
          agendas[agendaUrl].doubleNumbers = '';
          for (const doubleNumber in doubleNumbers) {
            if (doubleNumbers.hasOwnProperty(doubleNumber)) {
              agendas[agendaUrl].doubleNumbers += `${doubleNumber}, `;
            }
          }
        }
        if (agendas[agendaUrl].missingNumbers && agendas[agendaUrl].missingNumbers.length > 1) {
          agendas[agendaUrl].missingNumbers = agendas[agendaUrl].missingNumbers.slice(0, agendas[agendaUrl].missingNumbers.length - 2);
        }
        if (agendas[agendaUrl].doubleNumbers && agendas[agendaUrl].doubleNumbers.length > 1) {
          agendas[agendaUrl].doubleNumbers = agendas[agendaUrl].doubleNumbers.slice(0, agendas[agendaUrl].doubleNumbers.length - 2);
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
  return filteredResults;
};

/* Oplijsten van agenda's waar er geen doorlopende nummering is van agendapunten */
router.get('/agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    let filteredResults = await getAgendasWithFaultyNumbers(req);
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

const getFixableAgendas = async function (req) {
  let agendas = await getAgendasWithFaultyNumbers(req);
  // now filter out the agenda's with uninterrupted numbers
  let filteredResults = [];
  for (const agenda of agendas) {
    if (agenda.wrongNumbers && agenda.wrongNumbers.length > 0) {
      // check whether the missing numbers are in the mededelingen
      agenda.mededelingen = {};
      agenda.mededelingen.mededelingen = await kaleidosData.getMededelingenForAgenda(agenda.agenda);
      let mededelingenSequence = checkNumberSequence(agenda.mededelingen.mededelingen);
      agenda.mededelingen.wrongNumbers = mededelingenSequence.wrongNumbers;
      agenda.mededelingen.doubleNumbers = mededelingenSequence.doubleNumbers;
      let fixable = false;
      agenda.possibleFixes = '';
      agenda.possibleFixesDorisDocTypes = '';

      for (let wrongMededelingNumber of agenda.mededelingen.wrongNumbers) {
        if (wrongMededelingNumber.agendapunt) {
          wrongMededelingNumber.dorisIds = await kaleidosData.getDorisIds(wrongMededelingNumber.agendapunt);
          if (wrongMededelingNumber.dorisIds && wrongMededelingNumber.dorisIds.length) {
            wrongMededelingNumber.dorisDocTypes = [];
            wrongMededelingNumber.dorisNumbers = [];
          }
          for (let dorisId of wrongMededelingNumber.dorisIds) {
            let dorisRecords = dorisMetadata.lookup(dorisId);
            for (let dorisRecord of dorisRecords) {
              wrongMededelingNumber.dorisDocTypes.push(dorisRecord.dar_doc_type);
              wrongMededelingNumber.dorisNumbers.push(dorisRecord.dar_volgnummer);
            }
          }
        }
      }

      for (let wrongNumber of agenda.wrongNumbers) {
        for (let wrongMededelingNumber of agenda.mededelingen.wrongNumbers) {
          if (wrongNumber.missingNumber === wrongMededelingNumber.prioriteit) {
            fixable = true;
            agenda.possibleFixes += `${wrongNumber.missingNumber}, `;
            if (wrongMededelingNumber.dorisDocTypes) {
              agenda.possibleFixesDorisDocTypes += wrongMededelingNumber.dorisDocTypes[0] + ', ';
            }
          }
        }
      }
      if (fixable && (!agenda.doubleNumbers || Object.keys(agenda.doubleNumbers).length === 0)) {
        if (agenda.possibleFixes && agenda.possibleFixes.length > 1) {
          agenda.possibleFixes = agenda.possibleFixes.slice(0, agenda.possibleFixes.length - 2);
        }
        if (agenda.possibleFixesDorisDocTypes && agenda.possibleFixesDorisDocTypes.length > 1) {
          agenda.possibleFixesDorisDocTypes = agenda.possibleFixesDorisDocTypes.slice(0, agenda.possibleFixesDorisDocTypes.length - 2);
        }
        filteredResults.push(agenda);
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
    let filteredResults = await getFixableAgendas(req);
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(filteredResults, req, res, `${name}.csv`, ['agendapunten', 'wrongNumbers', 'mededelingen']);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Problems with the above we can automatically fix */
router.get('/unfixable-agendas-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    let agendas = await getAgendasWithFaultyNumbers(req);
    let fixableAgendas = await getFixableAgendas(req);
    let filteredResults = agendas.filter((agenda) => {
      for (const fixableAgenda of fixableAgendas) {
        if (agenda.agenda === fixableAgenda.agenda) {
          return false;
        }
      }
      return true;
    });
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(filteredResults, req, res, `${name}.csv`, ['agendapunten', 'wrongNumbers', 'mededelingen']);
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

export default router;
