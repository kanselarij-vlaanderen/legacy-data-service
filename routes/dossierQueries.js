const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
import { getSimilarity, getWeightedScore } from '../util/similarity';
import csv from '../util/csv';
const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MAX_RESULTS = 100000000; // used for debugging pruposes

/* Oplijsten & groeperen van alle procedurestappen met meer dan 1 dossier */
const getProcedureStappenWithMultipleDossiers = async function (limit) {
  const name = 'procedurestappen-met-meer-dossiers';
  const query = await queries.getQueryFromFile('/app/queries/procedurestappen_met_meer_dossiers.sparql');
  let results = await caching.getLocalJSONFile(name);
  if (!results) {
    results = await kaleidosData.executeQuery(query, limit);
    // generate urls
    for (const result of results) {
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      const procedurestapId = result.procedurestap.substring(result.procedurestap.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers/${procedurestapId}/overzicht`;
    }
    await caching.writeLocalFile(name, results);
  }
  return results;
};

/* Oplijsten alle procedurestappen met meer dan 1 dossier */
router.get('/procedurestappen-met-meer-dossiers', async function(req, res) {
  try {
    let results = await getProcedureStappenWithMultipleDossiers(req.query.limit);
    // group the results by procedurestap
    let procedurestappen = {};
    for (const result of results) {
      if (result.procedurestap) {
        if (!procedurestappen[result.procedurestap]) {
          let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
          let dorisRecords = dorisMetadata.lookup(dorisId);
          procedurestappen[result.procedurestap] = {
            procedurestap: result.procedurestap,
            aantalDossiers: result.count,
            dossiers: [],
            urls: [],
            titel: result.procedurestapTitle,
            dorisId: dorisId,
            dorisRecords: dorisRecords
          };
        }
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        procedurestappen[result.procedurestap].dossiers.push({
          dossier: result.dossier,
          titel: result.dossierTitle,
          url: `${BASE_URL}/dossiers/${dossierId}/deeldossiers`
        });
        procedurestappen[result.procedurestap].urls.push(result.url);
      }
    }
    const resultArray = [];
    for (const procedurestapUrl in procedurestappen) {
      if (procedurestappen.hasOwnProperty(procedurestapUrl)) {
        resultArray.push(procedurestappen[procedurestapUrl]);
      }
    }
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${resultArray.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(resultArray, req, res, `${name}.csv`, ['dorisRecords', 'dossiers']);
    } else {
      res.send(resultArray);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten alle dar_document_nr of potpourri dossiers */
router.get('/potpourri-document-nrs', async function(req, res) {
  try {
    let results = await getProcedureStappenWithMultipleDossiers(req.query.limit);
    // group the results by dar_document_nr
    let numbers = {};
    for (const result of results) {
      if (result.source) {
        let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
        let dorisRecords = dorisMetadata.lookup(dorisId);
        for (const dorisRecord of dorisRecords) {
          if (dorisRecord.dar_document_nr) {
            if (!numbers[dorisRecord.dar_document_nr]) {
              numbers[dorisRecord.dar_document_nr] = {
                dossiers: [],
                procedurestappen: []
              };
            }
            if (numbers[dorisRecord.dar_document_nr].procedurestappen.indexOf(result.procedurestap) === -1) {
              numbers[dorisRecord.dar_document_nr].procedurestappen.push(result.procedurestap);
            }
            if (numbers[dorisRecord.dar_document_nr].dossiers.indexOf(result.dossier) === -1) {
              numbers[dorisRecord.dar_document_nr].dossiers.push(result.dossier);
            }
          }
        }
      }
    }
    const resultArray = [];
    for (const number in numbers) {
      if (numbers.hasOwnProperty(number)) {
        resultArray.push({ 'dar_document_nr': number, procedurestappen: numbers[number].procedurestappen.length, dossiers: numbers[number].dossiers.length });
      }
    }
    resultArray.sort((a, b) => { return b.count - a.count; });
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${resultArray.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(resultArray, req, res, `${name}.csv`, []);
    } else {
      res.send(resultArray);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* Oplijsten & groeperen van alle procedurestappen in een mogelijk potpourri dossier */
const getProcedureStappenInPotpourriDossiers = async function (limit) {
  const name = 'procedurestappen-in-potpourri-dossiers';
  const query = await queries.getQueryFromFile('/app/queries/procedurestappen_in_potpourri_dossiers.sparql');
  let results = await caching.getLocalJSONFile(name);
  if (!results) {
    results = await kaleidosData.executeQuery(query, limit);
    // generate urls
    for (const result of results) {
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      const procedurestapId = result.procedurestap.substring(result.procedurestap.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers/${procedurestapId}/overzicht`;
    }
    await caching.writeLocalFile(name, results);
  }
  return results;
};

router.get('/mogelijke-potpourri-dossiers', async function(req, res) {
  try {
    let results = await getProcedureStappenInPotpourriDossiers(req.query.limit);
    // group the results by dossier
    let dossiers = {};
    for (const result of results) {
      if (result.dossier) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        if (!dossiers[result.dossier]) {
          dossiers[result.dossier] = {
            dossier: result.dossier,
            titel: result.dossierTitle,
            url: `${BASE_URL}/dossiers/${dossierId}/deeldossiers`,
            procedurestappen: [],
            aantalProcedurestappen: 0
          };
        }
        let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
        let dorisRecords = dorisMetadata.lookup(dorisId);
        dossiers[result.dossier].procedurestappen.push({
          procedurestap: result.procedurestap,
          aantalDossiers: result.count,
          url: result.url,
          titel: result.procedurestapTitle,
          dorisId: dorisId,
          dorisRecords: dorisRecords
        });
        dossiers[result.dossier].aantalProcedurestappen++;
      }
    }
    const resultArray = [];
    for (const dossierUrl in dossiers) {
      if (dossiers.hasOwnProperty(dossierUrl)) {
        resultArray.push(dossiers[dossierUrl]);
      }
    }
    resultArray.sort((a, b) => {
      return b.aantalProcedurestappen - a.aantalProcedurestappen;
    });
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${resultArray.length} results`);
    let limit = resultArray.length;
    if (req.query.limit) {
      limit = req.query.limit;
    }
    console.log('LIMIT: ' + limit);
    if (req.query && req.query.csv) {
      csv.sendCSV(resultArray.slice(0, limit), req, res, `${name}.csv`, ['procedurestappen']);
    } else {
      res.send(resultArray.slice(0, limit));
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});


router.get('/potpourri-dossiers-doris-links', async function(req, res) {
  try {
    let results = await getProcedureStappenInPotpourriDossiers(req.query.limit);
    // group the results by dossier
    let dossiers = {};
    for (const result of results) {
      if (result.dossier) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        if (!dossiers[result.dossier]) {
          dossiers[result.dossier] = {
            dossier: result.dossier,
            titel: result.dossierTitle,
            url: `${BASE_URL}/dossiers/${dossierId}/deeldossiers`,
            procedurestappen: [],
            aantalProcedurestappen: 0
          };
        }
        let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
        let dorisRecords = dorisMetadata.lookup(dorisId);
        let dar_document_nr = [];
        let dar_vorige = [];
        let dar_rel_docs = [];
        for (const dorisRecord of dorisRecords) {
          if (dorisRecord.dar_document_nr) {
            dar_document_nr.push(dorisRecord.dar_document_nr);
          }
          if (dorisRecord.dar_vorige) {
            dar_vorige.push(dorisRecord.dar_vorige);
          }
          if (dorisRecord.dar_rel_docs) {
            dar_rel_docs.push(dorisRecord.dar_rel_docs);
          }
        }
        dossiers[result.dossier].procedurestappen.push({
          procedurestap: result.procedurestap,
          aantalDossiers: result.count,
          url: result.url,
          titel: result.procedurestapTitle,
          dorisId: dorisId,
          dar_document_nr: dar_document_nr,
          dar_vorige: dar_vorige,
          dar_rel_docs: dar_rel_docs
        });
        dossiers[result.dossier].aantalProcedurestappen++;
      }
    }
    const resultArray = [];
    for (const dossierUrl in dossiers) {
      if (dossiers.hasOwnProperty(dossierUrl)) {
        resultArray.push(dossiers[dossierUrl]);
      }
    }
    resultArray.sort((a, b) => {
      return b.aantalProcedurestappen - a.aantalProcedurestappen;
    });
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${resultArray.length} results`);
    let limit = resultArray.length;
    if (req.query.limit) {
      limit = req.query.limit;
    }
    console.log('LIMIT: ' + limit);
    if (req.query && req.query.csv) {
      csv.sendCSV(resultArray.slice(0, limit), req, res, `${name}.csv`, ['procedurestappen']);
    } else {
      res.send(resultArray.slice(0, limit));
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
