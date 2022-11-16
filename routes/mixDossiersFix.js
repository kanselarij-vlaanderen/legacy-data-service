const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
import csv from '../util/csv';
import { uuid } from 'mu';

const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';
// const BASE_URL = 'https://kaleidos.vlaanderen.be';
const BASE_URL = 'http://localhost';

const MAX_RESULTS = 100000000; // used for debugging pruposes

const CASE_BASE_URI = 'http://themis.vlaanderen.be/id/dossier/';
const DECISIONFLOW_BASE_URI = 'http://themis.vlaanderen.be/id/besluitvormingsaangelegenheid/';

/* Oplijsten van alle procedurestappen van voor de start van kaleidos */
const getProcedureStappen = async function (limit) {
  const name = 'alle-pre-kaleidos-procedurestappen';
  const query = await queries.getQueryFromFile('/app/queries/alle_pre_kaleidos_procedurestappen.sparql');
  let results = await caching.getLocalJSONFile(name);
  if (!results) {
    results = await kaleidosData.executeQuery(query, limit);
    // generate urls
    for (const result of results) {
      const besluitvormingsaangelegenheidId = result.besluitvormingsaangelegenheid.substring(result.dossier.lastIndexOf('/') + 1);
      const procedurestapId = result.procedurestap.substring(result.procedurestap.lastIndexOf('/') + 1);
      result.url = `${BASE_URL}/dossiers/${besluitvormingsaangelegenheidId}/deeldossiers/${procedurestapId}/overzicht`;
    }
    await caching.writeLocalFile(name, results);
  }
  return results;
};


/* Alle procedurestappen van voor kaleidos groeperen per dossier */
const getDossiers = async function (limit) {
  let results = await getProcedureStappen(limit);
  // group the results by dossier
  let cases = {};
  let undefinedDorisIds = [];
  for (const result of results) {
    if (result.dossier) {
      if (!cases[result.dossier]) {
        const besluitvormingsaangelegenheidId = result.besluitvormingsaangelegenheid.substring(result.besluitvormingsaangelegenheid.lastIndexOf('/') + 1);
        cases[result.dossier] = {
          dossier: result.dossier,
          besluitvormingsaangelegenheid: result.besluitvormingsaangelegenheid,
          publicatieDossier: result.publicatieDossier,
          url: `${BASE_URL}/dossiers/${besluitvormingsaangelegenheidId}/deeldossiers`,
          procedurestappen: []
        };
      }
      let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
      if (dorisId && dorisId.indexOf('/') > -1) {
        console.log('***************');
        console.log('WARNING: dorid id ' + dorisId + ' is not what we expected');
        console.log('***************');
      } else if (!dorisId) {
        undefinedDorisIds.push(result);
      }
      let dorisRecord = dorisMetadata.lookup(dorisId);
      cases[result.dossier].procedurestappen.push({
        procedurestap: result.procedurestap,
        dorisId: dorisId,
        dorisRecord: dorisRecord
      });
    }
  }
  const resultArray = [];
  for (const dossierUrl in cases) {
    if (cases.hasOwnProperty(dossierUrl)) {
      resultArray.push(cases[dossierUrl]);
    }
  }
  console.log('There were ' + undefinedDorisIds.length + ' subcases with undefined doris sources.');
  return resultArray;
};

/* Oplijsten alle procedurestappen pre-kaleidos */
router.get('/mixdossiers-fix-get-alle-dossiers', async function(req, res) {
  try {
    let cases = await getDossiers(req.query.limit)
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${cases.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(cases, req, res, `${name}.csv`, []);
    } else {
      res.send(cases);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* This generates a mapping of 1 unique case per subcase, containing a decision flow with only that subcase, as well as a list of which subcase links to remove.
We're not adding uuids or generating URIs yet, as these results will be used in a later stage to cluster the relevant subcases. */
router.get('/mixdossiers-fix-1-dossier-per-procedurestap', async function(req, res) {
  try {
    let cases = await getDossiers(req.query.limit)
    let subcaseCaseMapping = {}; // keep track of which cases/decisionflows were added for each subcase. We'll store the kaleidos url in here for convenience
    let toRemove = [];
    for (let i = 0; i < cases.length; i++) {
      if (cases[i].procedurestappen.length === 1) {
        let valid = true;
        // check if we already added this subcase
        if (subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap]) {
          console.log('---------');
          console.log('WARNING: double single subcase ' + cases[i].procedurestappen[0].procedurestap);
          console.log('Appears in: ');
          console.log(cases[i].url);
          console.log(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].url);
          if (cases[i].procedurestappen[0].dorisId !== subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].procedurestappen[0].dorisId) {
            console.log('***** DORIS ids were different *****'); //
          }
          // we need to decide which to keep. If one of them has a publication, we'll keep that one.
          if (cases[i].publicatieDossier && !subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].publicatieDossier) {
            toRemove.push(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap]);
            subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
          } else {
            toRemove.push(cases[i]);
          }
        } else {
          subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
        }
      } else if (cases[i].procedurestappen.length > 1) {
        for (const subcase of cases[i].procedurestappen) {
          if (subcaseCaseMapping[subcase.procedurestap]) {
            // we already have a case & decision flow for this one. Mark this triple for removal
            toRemove.push({ ...cases[i], procedurestappen: [subcase] });
          } else {
            // we need to create a new case & decision flow for this one
            subcaseCaseMapping[subcase.procedurestap] = {
              procedurestappen: [subcase]
            };
          }
        }
      }
    }
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${Object.keys(subcaseCaseMapping).length} results`);
    console.log(`There were ${toRemove.length} subcase links marked for removal.`);
    res.send({ subcaseCaseMapping, toRemove });
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
