const express = require('express');
const router = express.Router();
import queryUtil from '../util/queries';
import kaleidosData from '../util/kaleidosData';

const SUBCASE_TYPES = {
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/bdba2bbc-7af6-490b-98a8-433955cfe869': 'Bekrachtiging en afkondiging',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/6f7d1086-7c02-4a80-8c60-5690894f70fc': 'Definitieve goedkeuring',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/7b90b3a6-2787-4b41-8a1d-886fc5abbb33': 'Principiële goedkeuring'
};

const extractSubcaseName = function (faultySubcaseTitle) {
  if (faultySubcaseTitle) {
    const regex = /(Principiële goedkeuring.+)$|(Goedkeuring na.+)$/i;
    // we have to account for multiple titles separated by \n
    let titles = faultySubcaseTitle.split('\n');
    let subcaseNames = [];
    for (const title of titles) {
      const matches = title.match(regex);
      if (matches?.length) {
        subcaseNames.push(matches[0]);
      }
    }
    if (subcaseNames?.length) {
      return subcaseNames[0];
    }
  }
  return;
};

const extractCaseTitle = function (faultyCaseTitle) {
  if (faultyCaseTitle) {
    const regex = /(.+)((- Voorontwerp)|(- Ontwerp\S*))/i;
    // we have to account for multiple titles separated by \n
    let titles = faultyCaseTitle.split('\n');
    let caseTitles = [];
    for (const title of titles) {
      const matches = title.match(regex);
      if (matches?.length) {
        // we want group 1, not match one.
        // e.g. in the string "Gemeentefonds - Voorontwerp van decreet tot vaststelling van de regelen inzake de verdeling van het gemeentefonds."
        // matches will return ["Gemeentefonds - Voorontwerp", "Gemeentefonds ", "- Voorontwerp", "- Voorontwerp", undefined]
        caseTitles.push(matches[1].replace(/ $/, ""));
      } else {
        caseTitles.push(title);
      }
    }
    let reconstructedCaseTitle = caseTitles.join('\n');
    // we don't want to return anything if there was no improvement
    if (reconstructedCaseTitle?.length && faultyCaseTitle != reconstructedCaseTitle) {
      return reconstructedCaseTitle;
    }
  }
  return;
};

router.get('/dossier-titels-fix', async function(req, res) {
  const name = req.path.replace('/', '');
  // The cases with wrong titles can be identified using different indicators, but there will be overlap
  // We'll fetch them all, and then de-duplicate programmatically
  const queries = [];
  queries.push(await queryUtil.getQueryFromFile('/app/queries/dossier_titels_fix_voorontwerpen.sparql'));
  queries.push(await queryUtil.getQueryFromFile('/app/queries/dossier_titels_fix_ontwerpbesluiten_en_ontwerpdecreten.sparql'));
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
        let correctedCaseShortTitle = extractCaseTitle(entry.langeTitel);
        let correctedCaseLongTitle;
        if (correctedCaseShortTitle) {
          correctedCaseLongTitle = entry.langeTitel.replace(correctedCaseShortTitle, "").replace(/\s*-\s*/,"");
          const subcaseNameInCaseTitle = extractSubcaseName(correctedCaseLongTitle);
          if (subcaseNameInCaseTitle) {
            correctedCaseLongTitle = correctedCaseLongTitle.replace(subcaseNameInCaseTitle, "");
          }
        }
        const correctedSubcaseName = extractSubcaseName(entry.procedurestapLangeTitel);
        let correctedSubcaseLongTitle;
        if (correctedSubcaseName) {
          correctedSubcaseLongTitle = entry.procedurestapLangeTitel.replace(correctedSubcaseName, "");
        }
        let correctedSubcaseShortTitle = extractCaseTitle(entry.procedurestapLangeTitel);
        if (correctedSubcaseShortTitle) {
          correctedSubcaseLongTitle = correctedSubcaseLongTitle ? correctedSubcaseLongTitle : entry.procedurestapLangeTitel;
          correctedSubcaseLongTitle = correctedSubcaseLongTitle.replace(correctedSubcaseShortTitle, "").replace(/\s*-\s*/,"");
        }
        // Sometimes the short and long title were swapped.
        // The biggest indicator is illogical length & the presence of newlines
        if (
          correctedCaseLongTitle &&
          correctedCaseShortTitle &&
          correctedCaseLongTitle.length < correctedCaseShortTitle.length &&
          correctedCaseShortTitle.indexOf('\n') > -1
        ) {
          const t = "" + correctedCaseShortTitle;
          correctedCaseShortTitle = correctedCaseLongTitle;
          correctedCaseLongTitle = t;
        }
        if (
          correctedSubcaseLongTitle &&
          correctedSubcaseShortTitle &&
          correctedSubcaseLongTitle.length < correctedSubcaseShortTitle.length &&
          correctedSubcaseShortTitle.indexOf('\n') > -1
        ) {
          const t = "" + correctedSubcaseShortTitle;
          correctedSubcaseShortTitle = correctedSubcaseLongTitle;
          correctedSubcaseLongTitle = t;
        }
        if (!caseMap[entry.dossier]) {
          caseMap[entry.dossier] = {
            dossier: {
              url: entry.dossier,
              origineel: {
                langeTitel: entry.langeTitel,
                korteTitel: entry.korteTitel
              },
              correctie: {
                langeTitel: correctedCaseLongTitle,
                korteTitel: correctedCaseShortTitle
              }
            },
            procedurestappen: {}
          }
        }
        caseMap[entry.dossier].procedurestappen[entry.url] = {
          datumMR: entry.datumMR,
          url: entry.url,
          procedurestapType: entry.procedurestapType,
          origineel: {
            procedurestapLangeTitel: entry.procedurestapLangeTitel,
            procedurestapKorteTitel: entry.procedurestapKorteTitel,
            procedurestapNaam: entry.procedurestapNaam
          },
          correctie: {
            procedurestapLangeTitel: correctedSubcaseLongTitle,
            procedurestapKorteTitel: correctedSubcaseShortTitle,
            procedurestapNaam: correctedSubcaseName
          }
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
