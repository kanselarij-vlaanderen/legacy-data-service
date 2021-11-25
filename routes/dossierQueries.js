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

/* Oplijsten alle mogelijke "potpourri" dossiers */
router.get('/mogelijke-potpourri-dossiers', async function(req, res) {
  try {
    let results = await getProcedureStappenWithMultipleDossiers(req.query.limit);
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
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${resultArray.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(resultArray, req, res, `${name}.csv`, ['procedurestappen']);
    } else {
      res.send(resultArray);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
