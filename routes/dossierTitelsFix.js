const express = require('express');
const router = express.Router();
import queryUtil from '../util/queries';
import kaleidosData from '../util/kaleidosData';

const SUBCASE_TYPES = {
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/bdba2bbc-7af6-490b-98a8-433955cfe869': 'Bekrachtiging en afkondiging',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/6f7d1086-7c02-4a80-8c60-5690894f70fc': 'Definitieve goedkeuring',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/7b90b3a6-2787-4b41-8a1d-886fc5abbb33': 'Principiële goedkeuring'
};

router.get('/dossier-titels-fix', async function(req, res) {
  const name = req.path.replace('/', '');
  // The cases with wrong titles can be identified using different indicators, but there will be overlap
  // We'll fetch them all, and then de-duplicate programmatically
  const queries = [];
  queries.push(await queryUtil.getQueryFromFile('/app/queries/dossier_titels_fix_voorontwerpen.sparql'));
  queries.push(await queryUtil.getQueryFromFile('/app/queries/dossier_titels_fix_procedurestapnaam.sparql'));
  try {
    const results = [];
    for (const query of queries) {
      results.push(await kaleidosData.executeQuery(query, req.query.limit));
    }
    // deduplicate the results
    const subcaseMap = {};
    const caseMap = {};
    for (const result of results) {
      for (const entry of result) {
        if (entry.procedurestapType) {
          entry.procedurestapType = {
            uri: entry.procedurestapType,
            label: SUBCASE_TYPES[entry.procedurestapType]
          }
        }
        subcaseMap[entry.url] = entry;
        if (!caseMap[entry.dossier]) {
          caseMap[entry.dossier] = {
            dossier: {
              url: entry.dossier,
              langeTitel: entry.langeTitel,
              korteTitel: entry.korteTitel
            },
            procedurestappen: {}
          }
        }
        caseMap[entry.dossier].procedurestappen[entry.url] = {
          datumMR: entry.datumMR,
          url: entry.url,
          procedurestapTitel: entry.procedurestapTitel,
          procedurestapType: entry.procedurestapType,
          procedurestapNaam: entry.procedurestapNaam
        }
      }
    }
    const subcases = Object.values(subcaseMap);
    const cases = Object.values(caseMap);
    console.log(`GET /${name}: ${subcases.length} subcases`);
    console.log(`GET /${name}: ${cases.length} cases`);
    if (req.query && req.query.csv) {
      csv.sendCSV(cases, req, res, `${name}.csv`);
    } else {
      res.send(cases);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
