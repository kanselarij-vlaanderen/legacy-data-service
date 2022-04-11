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
          let missingNumbers = [];
          for (let i = +previous.prioriteit + 1; i < +agendapunt.prioriteit; i++) {
            missingNumbers.push(i);
          }
          wrongNumbers.push({ agendapunt: agendapunt.agendapunt, prioriteit: +agendapunt.prioriteit, missingNumbers: missingNumbers });
        }
      }
      if (agendapunt !== undefined) {
        previous = agendapunt;
      }
    }
  }
  return { wrongNumbers, doubleNumbers };
};

/* Group an array of agendapunten by agenda url */
const getAgendas = function (agendapunten) {
  let agendas = {};
  for (const agendapunt of agendapunten) {
    if (agendapunt.agenda) {
      if (!agendas[agendapunt.agenda]) {
        let title = agendapunt.title;
        if (!title && agendapunt.geplandeStart) {
          let startDate = new Date(agendapunt.geplandeStart);
          title = 'Agenda van ' + startDate.toLocaleString('nl-BE', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        agendas[agendapunt.agenda] = {
          agenda: agendapunt.agenda,
          titel: title,
          geplandeStart: agendapunt.geplandeStart,
          meeting: agendapunt.meeting,
          agendapunten: [],
          mededelingen: []
        }
      }
      let agendapuntCopy = {
        agendapunt: agendapunt.agendapunt,
        prioriteit: agendapunt.agendapuntPrioriteit,
        wordtGetoondAlsMededeling: agendapunt.wordtGetoondAlsMededeling === 'true',
        dorisUrl: agendapunt.dorisUrl
      };
      if (agendapuntCopy.wordtGetoondAlsMededeling) {
        agendas[agendapunt.agenda].mededelingen.push(agendapuntCopy);
      } else {
        agendas[agendapunt.agenda].agendapunten.push(agendapuntCopy);
      }
    }
  }
  let agendaArray = [];
  for (const agendaUrl in agendas) {
    if (agendas.hasOwnProperty(agendaUrl)) {
      // sort the agendapunten
      agendas[agendaUrl].agendapunten.sort((a, b) => {
        if (+a.prioriteit > +b.prioriteit) {
          return 1;
        } else if (+a.prioriteit < +b.prioriteit) {
          return -1;
        }
        return 0;
      });
      // sort the mededelingen
      agendas[agendaUrl].mededelingen.sort((a, b) => {
        if (+a.prioriteit > +b.prioriteit) {
          return 1;
        } else if (+a.prioriteit < +b.prioriteit) {
          return -1;
        }
        return 0;
      });
      agendaArray.push(agendas[agendaUrl]);
    }
  }
  return agendaArray;
};

const getAgendasWithFaultyNumbers = async function (agendapunten) {
  // first group the agendapunten per agenda
  let agendas = getAgendas(agendapunten);
  // now filter out the agenda's with uninterrupted numbers
  let filteredResults = [];
  for (const agenda of agendas) {
    let { wrongNumbers, doubleNumbers } = checkNumberSequence(agenda.agendapunten);
    if (wrongNumbers.length > 0 || Object.keys(doubleNumbers).length > 0) {
      if (wrongNumbers.length > 0) {
        agenda.wrongNumbers = wrongNumbers;
        agenda.missingNumbers = '';
        for (const wrongNumber of wrongNumbers) {
          if (wrongNumber.missingNumbers) {
            agenda.missingNumbers += `${wrongNumber.missingNumbers.join(', ')}, `;
          }
        }
      }
      if (Object.keys(doubleNumbers).length > 0) {
        agenda.doubleNumbers = '';
        for (const doubleNumber in doubleNumbers) {
          if (doubleNumbers.hasOwnProperty(doubleNumber)) {
            agenda.doubleNumbers += `${doubleNumber}, `;
          }
        }
      }
      if (agenda.missingNumbers && agenda.missingNumbers.length > 1) {
        agenda.missingNumbers = agenda.missingNumbers.slice(0, agenda.missingNumbers.length - 2);
      }
      if (agenda.doubleNumbers && agenda.doubleNumbers.length > 1) {
        agenda.doubleNumbers = agenda.doubleNumbers.slice(0, agenda.doubleNumbers.length - 2);
      }
      filteredResults.push(agenda);
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
    let filteredResults = await getAgendasWithFaultyNumbers(results);
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

const getFixableAgendas = async function (agendas) {
  // now filter out the agenda's with uninterrupted numbers
  let filteredResults = [];
  for (const agenda of agendas) {
    if (agenda.wrongNumbers && agenda.wrongNumbers.length > 0) {
      // check whether the missing numbers are in the mededelingen
      if (!agenda.mededelingen || agenda.mededelingen.length === 0) {
        agenda.mededelingen = await kaleidosData.getMededelingenForAgenda(agenda.agenda);
      }
      let fixable = false;
      agenda.possibleFixes = '';
      agenda.possibleFixesDorisDocTypes = '';

      // first get the DORIS data for all mededelingen
      for (let mededeling of agenda.mededelingen) {
        if (mededeling.dorisUrl !== undefined) {
          mededeling.dorisId = mededeling.dorisUrl.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '');
        } else {
          let dorisIds = await kaleidosData.getDorisIds(mededeling.agendapunt);
          if (dorisIds && dorisIds.length) {
            if (dorisIds.length > 1) {
              throw("ERROR: multiple DORIS ids for mededeling " + mededeling.agendapunt);
            }
            mededeling.dorisId = dorisIds[0];
          }
        }
        if (mededeling.dorisId) {
          let dorisRecord = dorisMetadata.lookup(mededeling.dorisId, ['dar_doc_type', 'dar_volgnummer']);
          if (dorisRecord) {
            mededeling.dorisDocType = dorisRecord.dar_doc_type;
            mededeling.dorisNumber = dorisRecord.dar_volgnummer;
          }
        }
      }
      // then check the doc types and priorities to identify mededelingen that should be nota's
      for (let mededeling of agenda.mededelingen) {
        for (let wrongNumber of agenda.wrongNumbers) {
          for (let missingNumber of wrongNumber.missingNumbers) {
            if (missingNumber === +mededeling.prioriteit) {
              if (mededeling.dorisDocType && mededeling.dorisDocType.toLowerCase() !== 'mededeling') {
                agenda.possibleFixesDorisDocTypes += mededeling.dorisDocType + ', ';
                agenda.possibleFixes += `${missingNumber}, `;
                fixable = true;
              }
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
    let agendas = await getAgendasWithFaultyNumbers(results);
    let filteredResults = await getFixableAgendas(agendas);
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
    let agendas = await getAgendasWithFaultyNumbers(results);
    let fixableAgendas = await getFixableAgendas(agendas);
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
    let agendas = await getAgendasWithFaultyNumbers(results);
    let filteredResults = await getFixableAgendas(agendas);
    console.log(`GET /${name}: ${filteredResults.length} filtered results`);
    let inserts = {};
    let deletes = {}
    let fixedAgendaUrls = [];
    for (const result of filteredResults) {
      for (const missing of result.wrongNumbers) {
        for (const potentialFix of result.mededelingen.wrongNumbers) {
          for (let missingNumber of missing.missingNumbers) {
            if (missingNumber === potentialFix.prioriteit) {
              fixedAgendaUrls.push({ url: result.url, fixedNumber: missingNumber });
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

/* Oplijsten van alle agenda's met een DORIS id */
router.get('/agendas-met-DORIS-id', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten_met_DORIS_id.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        const agendapuntId = result.agendapunt.substring(result.agenda.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendapuntId}`;
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

/* Oplijsten van alle agenda's met een DORIS id én met foute nummering */
router.get('/agendas-met-DORIS-id-en-foute-nummering', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    const query = await queries.getQueryFromFile('/app/queries/agendapunten_met_DORIS_id.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
    let jsonResult = await caching.getLocalJSONFile('agendas-met-DORIS-id');
    let results;
    if (jsonResult) {
      results = jsonResult;
    } else {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      console.log(`GET /${'agendas-met-DORIS-id'}: ${results.length} results before filtering`);
      await caching.writeLocalFile('agendas-met-DORIS-id', results);
    }
    let agendas = await getAgendasWithFaultyNumbers(results);
    let filteredResults = await getFixableAgendas(agendas);
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

/* Oplijsten van alle mededelingen die nota's zijn in DORIS */
router.get('/mededelingen-nota-in-DORIS', async function(req, res) {
  const name = req.path.replace('/', '');
  try {
    const query = await queries.getQueryFromFile('/app/queries/agendapunten_met_DORIS_id.sparql'); // to inspect query results add: ORDER BY ?geplandeStart ?meeting ?agenda ?agendapuntPrioriteit
    let jsonResult = await caching.getLocalJSONFile('agendas-met-DORIS-id');
    let results;
    if (jsonResult) {
      results = jsonResult;
    } else {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      console.log(`GET /${'agendas-met-DORIS-id'}: ${results.length} results before filtering`);
      await caching.writeLocalFile('agendas-met-DORIS-id', results);
    }
    let agendas = await getAgendas(results);
    let filteredIds = [];
    let filteredResults = [];
    for (let agenda of agendas) {
      for (const mededeling of agenda.mededelingen) {
        if (mededeling.dorisUrl !== undefined) {
          mededeling.dorisId = mededeling.dorisUrl.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '');
        }
        if (mededeling.dorisId) {
          let dorisRecord = dorisMetadata.lookup(mededeling.dorisId, ['dar_doc_type', 'dar_fiche_type', 'dar_volgnummer']);
          if (dorisRecord) {
            mededeling.dorisDocType = dorisRecord.dar_doc_type;
            if (!mededeling.dorisDocType) {
              mededeling.dorisDocType = dorisRecord.dar_fiche_type;
            }
            mededeling.dorisNumber = dorisRecord.dar_volgnummer;
            if (mededeling.dorisDocType && mededeling.dorisDocType.toLowerCase() === 'nota' && filteredIds.indexOf(agenda.agenda) === -1) {
              filteredIds.push(agenda.agenda);
              filteredResults.push(agenda);
            }
          }
        }
      }
    }
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

export default router;
