const express = require('express');
const router = express.Router();
import queryUtil from '../util/queries';
import kaleidosData from '../util/kaleidosData';
import csv from '../util/csv';

const SUBCASE_TYPES = {
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/bdba2bbc-7af6-490b-98a8-433955cfe869': 'Bekrachtiging en afkondiging',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/6f7d1086-7c02-4a80-8c60-5690894f70fc': 'Definitieve goedkeuring',
  'http://themis.vlaanderen.be/id/concept/procedurestap-type/7b90b3a6-2787-4b41-8a1d-886fc5abbb33': 'Principiële goedkeuring'
};

const extractSubcaseName = function (faultySubcaseTitle) {
  if (faultySubcaseTitle) {
    const regex = /(Principiële goedkeuring m\.h\.o\..+)$|(Goedkeuring na .+)$/i;
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
    for (const result of results) {
      for (const entry of result) {
        subcaseMap[entry.procedurestap] = entry;
      }
    }
    const subcases = Object.values(subcaseMap).sort((a, b) => {
      return new Date(a.procedurestapDatum).getTime() - new Date(b.procedurestapDatum).getTime()
    });
    // keep some stats
    let subcaseShortTitleUsed = 0;
    let shortTitleCorrected = 0;
    let longTitleCorrected = 0;
    let subcaseShortTitleCorrected = 0;
    let subcaseLongTitleCorrected = 0;
    let subcaseNameCorrected = 0;
    // process the query results
    const caseMap = {};
    for (const entry of subcases) {
      if (entry.procedurestapType) {
        entry.procedurestapType = {
          uri: entry.procedurestapType,
          label: SUBCASE_TYPES[entry.procedurestapType]
        }
      }
      // first try to extract as many correct titles as possible
      let correctedCaseShortTitle = extractCaseTitle(entry.langeTitel);
      let correctedCaseLongTitle;
      let shouldCorrectLongTitle = false;
      if (correctedCaseShortTitle) {
        correctedCaseLongTitle = entry.langeTitel.replace(correctedCaseShortTitle, "").replace(/\s+-\s+/g,"");
        const subcaseNameInCaseTitle = extractSubcaseName(correctedCaseLongTitle);
        if (correctedCaseLongTitle & subcaseNameInCaseTitle) {
          correctedCaseLongTitle = correctedCaseLongTitle.replace(subcaseNameInCaseTitle, "");
          shouldCorrectLongTitle = true;
        }
      }
      const correctedSubcaseName = extractSubcaseName(entry.procedurestapLangeTitel);
      let correctedSubcaseLongTitle;
      let shouldCorrectSubcaseLongTitle = false;
      if (correctedSubcaseName) {
        correctedSubcaseLongTitle = entry.procedurestapLangeTitel.replace(correctedSubcaseName, "");
        if (entry.procedurestapLangeTitel) {
          shouldCorrectSubcaseLongTitle = true; // even if it's empty now, we don't want the procedurestapnaam in here
        }
        if (correctedCaseLongTitle) {
          correctedCaseLongTitle = correctedCaseLongTitle.replace(correctedSubcaseName, "");
          shouldCorrectLongTitle = true;
        } else {
          correctedCaseLongTitle = entry.procedurestapLangeTitel.replace(correctedSubcaseName, "");
          shouldCorrectLongTitle = true;
        }
      }
      let correctedSubcaseShortTitle = extractCaseTitle(entry.procedurestapLangeTitel);
      if (correctedSubcaseShortTitle) {
        correctedSubcaseLongTitle = correctedSubcaseLongTitle ? correctedSubcaseLongTitle : entry.procedurestapLangeTitel;
        correctedSubcaseLongTitle = correctedSubcaseLongTitle.replace(correctedSubcaseShortTitle, "").replace(/\s+-\s+/g,"");
        if (entry.procedurestapLangeTitel) {
          shouldCorrectSubcaseLongTitle = true; // even if it's empty now, we don't want the procedurestapnaam in here
        }
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
        shouldCorrectLongTitle = true;
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
        shouldCorrectSubcaseLongTitle = true;
      }
      // then create an entry for the dossier if there isn't one already
      if (!caseMap[entry.dossier]) {
        caseMap[entry.dossier] = {
          dossier: {
            dossierLink: entry.dossierLink,
            url: entry.dossier,
            origineel: {
              langeTitel: entry.langeTitel,
              korteTitel: entry.korteTitel
            },
            correctie: {
              langeTitel: shouldCorrectLongTitle ? correctedCaseLongTitle : entry.langeTitel,
              korteTitel: correctedCaseShortTitle ? correctedCaseShortTitle : entry.korteTitel
            }
          },
          procedurestappen: {}
        }
        // keep some stats
        if (correctedCaseLongTitle || shouldCorrectLongTitle) {
          longTitleCorrected++;
        }
        if (correctedCaseShortTitle) {
          shortTitleCorrected++;
        }
      }
      // if one of the procedurestappen has an original short title, there's a good chance the dossier needs this title as well
      if (entry.procedurestapKorteTitel && !caseMap[entry.dossier].dossier.origineel.korteTitel) {
        // use the procedurestap shortTitle. We always overwrite it with the one from the latest subcase
        let correctedCaseShortTitleFromSubcase = extractCaseTitle(entry.procedurestapKorteTitel);
        // in some cases, we need to apply the same process as we did on the case title
        if (correctedCaseShortTitleFromSubcase) {
          // keep some stats
          if (!caseMap[entry.dossier].dossier.correctie.korteTitel) {
            shortTitleCorrected++;
            caseMap[entry.dossier].dossier.correctie.korteTitel = correctedCaseShortTitleFromSubcase;
          }
          if (!caseMap[entry.dossier].dossier.correctie.langeTitel) {
            let correctedCaseLongTitleFromSubcase = entry.procedurestapLangeTitel.replace(correctedCaseShortTitleFromSubcase, "").replace(/\s+-\s+/g,"");
            let subcaseNameInSubCaseTitle = extractSubcaseName(correctedCaseLongTitleFromSubcase);
            if (subcaseNameInSubCaseTitle) {
              correctedCaseLongTitleFromSubcase = correctedCaseLongTitleFromSubcase.replace(subcaseNameInSubCaseTitle, "");
            }
            if (!correctedCaseLongTitleFromSubcase) {
              // often the procedurestapLangeTitel will only contain the procedurestapNaam, and we need to use the procedurestapKorteTitel instead
              correctedCaseLongTitleFromSubcase = entry.procedurestapKorteTitel.replace(correctedCaseShortTitleFromSubcase, "").replace(/\s+-\s+/g,"");
              subcaseNameInSubCaseTitle = extractSubcaseName(correctedCaseLongTitleFromSubcase);
              if (subcaseNameInSubCaseTitle) {
                correctedCaseLongTitleFromSubcase = correctedCaseLongTitleFromSubcase.replace(subcaseNameInSubCaseTitle, "");
              }
            }
            caseMap[entry.dossier].dossier.correctie.langeTitel = correctedCaseLongTitleFromSubcase;
            longTitleCorrected++;
          }
        } else {
          // in other cases, we can use the title as-is
          // keep some stats
          subcaseShortTitleUsed++;
          if (caseMap[entry.dossier].dossier.correctie.korteTitel && !caseMap[entry.dossier].dossier.correctie.korteTitelUitProcedurestap) {
            shortTitleCorrected--;
          }
          if (caseMap[entry.dossier].dossier.correctie.korteTitelUitProcedurestap) {
            subcaseShortTitleUsed--;
          }
          caseMap[entry.dossier].dossier.correctie.korteTitel = entry.procedurestapKorteTitel;
          caseMap[entry.dossier].dossier.correctie.korteTitelUitProcedurestap = true;
        }
      }
      // Another edge case, in some cases, the short title is where all of the useful info was,
      // and the long title only contained the procedurestapNaam and is now empty.
      if (shouldCorrectSubcaseLongTitle && !correctedSubcaseLongTitle && entry.procedurestapKorteTitel && correctedSubcaseName) {
        correctedSubcaseShortTitle = extractCaseTitle(entry.procedurestapKorteTitel);
        if (correctedSubcaseShortTitle) {
          correctedSubcaseLongTitle = entry.procedurestapKorteTitel;
          correctedSubcaseLongTitle = correctedSubcaseLongTitle.replace(correctedSubcaseShortTitle, "").replace(/\s+-\s+/g,"");
          if (entry.procedurestapLangeTitel) {
            shouldCorrectSubcaseLongTitle = true; // even if it's empty now, we don't want the procedurestapnaam in here
          }
        }
      }
      caseMap[entry.dossier].procedurestappen[entry.procedurestap] = {
        datumMR: entry.datumMR,
        procedurestapLink: entry.procedurestapLink,
        url: entry.procedurestap,
        procedurestapType: entry.procedurestapType,
        procedurestapDatum: entry.procedurestapDatum,
        origineel: {
          procedurestapLangeTitel: entry.procedurestapLangeTitel,
          procedurestapKorteTitel: entry.procedurestapKorteTitel,
          procedurestapNaam: entry.procedurestapNaam
        },
        correctie: {
          procedurestapLangeTitel: shouldCorrectSubcaseLongTitle ? correctedSubcaseLongTitle : entry.procedurestapLangeTitel,
          procedurestapKorteTitel: correctedSubcaseShortTitle ? correctedSubcaseShortTitle : entry.procedurestapKorteTitel,
          procedurestapNaam: correctedSubcaseName
        }
      }
      // keep some stats
      if (correctedSubcaseLongTitle || shouldCorrectSubcaseLongTitle) {
        subcaseLongTitleCorrected++;
      }
      if (correctedSubcaseShortTitle) {
        subcaseShortTitleCorrected++;
      }
      if (correctedSubcaseName) {
        subcaseNameCorrected++;
      }
    }
    const cases = Object.values(caseMap);
    console.log(`GET /${name}: ${subcases.length} subcases processed`);
    console.log(`GET /${name}: ${cases.length} cases processed`);
    // filter the cases for only the corrected ones,
    let correctedCases = cases.filter((processedCase) => {
      const caseSubcases = Object.values(processedCase.procedurestappen);
      return processedCase.dossier.origineel.langeTitel != processedCase.dossier.correctie.langeTitel ||
      processedCase.dossier.origineel.korteTitel != processedCase.dossier.correctie.korteTitel ||
      caseSubcases?.filter((subcase) => {
        return subcase.origineel.procedurestapLangeTitel != subcase.correctie.procedurestapLangeTitel ||
        subcase.origineel.procedurestapKorteTitel != subcase.correctie.procedurestapKorteTitel ||
        subcase.origineel.procedurestapNaam != subcase.correctie.procedurestapNaam
      }).length > 0;
    })
    // and map the procedurestappen object to an Array for easier processing later on
    .map((correctedCase) => {
      return {
        ...correctedCase,
        procedurestappen: Object.values(correctedCase.procedurestappen).sort((a, b) => {
          return new Date(a.procedurestapDatum).getTime() - new Date(b.procedurestapDatum).getTime()
        })
      }
    });
    correctedCases = correctedCases.sort((a, b) => {
      return new Date(a.datumMR).getTime() - new Date(b.datumMR).getTime()
    });
    console.log(`Er zijn ${correctedCases.length} dossiers met minstens 1 correctie.`);
    console.log(`Voor ${subcaseShortTitleUsed} dossiers werd de originele korte titel van 1 van de procedurestappen gebruikt.`);
    console.log(`Voor ${shortTitleCorrected} dossiers werd de korte titel automatisch gecorrigeerd.`);
    console.log(`Voor ${longTitleCorrected} dossiers werd de lange titel automatisch gecorrigeerd.`);
    console.log(`Voor ${subcaseShortTitleCorrected} procedurestappen werd de korte titel automatisch gecorrigeerd.`);
    console.log(`Voor ${subcaseLongTitleCorrected} procedurestappen werd de lange titel automatisch gecorrigeerd.`);
    console.log(`Voor ${subcaseNameCorrected} procedurestappen werd de procedurestapnaam automatisch gecorrigeerd.`);
    if (req.query && req.query.csv) {
      // make a new array that is easier to read in a tabular format
      const corrections = [];
      for (const correctedCase of correctedCases) {
        // add a row for the dossier
        corrections.push({
          'Type': 'Dossier',
          'Datum': correctedCase.datumMR,
          'Kaleidos Link': correctedCase.dossier.dossierLink ? correctedCase.dossier.dossierLink : "",
          'Originele korte titel': correctedCase.dossier.origineel.korteTitel ? correctedCase.dossier.origineel.korteTitel : "",
          'Gecorrigeerde korte titel': correctedCase.dossier.correctie.korteTitel ? correctedCase.dossier.correctie.korteTitel : "",
          'Originele lange titel': correctedCase.dossier.origineel.langeTitel ? correctedCase.dossier.origineel.langeTitel : "" ,
          'Gecorrigeerde lange titel': correctedCase.dossier.correctie.langeTitel ? correctedCase.dossier.correctie.langeTitel : "",
          'Originele Procedurestapnaam': '',
          'Gecorrigeerde Procedurestapnaam': ''
        });
        for (const correctedSubCase of correctedCase.procedurestappen) {
          if (correctedSubCase.correctie && (
            correctedSubCase.correctie.procedurestapLangeTitel ||
            correctedSubCase.correctie.procedurestapKorteTitel ||
            correctedSubCase.correctie.procedurestapNaam
          )) {
            // add a row per subcase
            corrections.push({
              'Type': 'Procedurestap',
              'Datum': correctedSubCase.procedurestapDatum,
              'Kaleidos Link': correctedSubCase.procedurestapLink,
              'Originele korte titel': correctedSubCase.origineel.procedurestapKorteTitel ? correctedSubCase.origineel.procedurestapKorteTitel : "",
              'Gecorrigeerde korte titel': correctedSubCase.correctie.procedurestapKorteTitel ? correctedSubCase.correctie.procedurestapKorteTitel : "",
              'Originele lange titel': correctedSubCase.origineel.procedurestapLangeTitel ? correctedSubCase.origineel.procedurestapLangeTitel : "" ,
              'Gecorrigeerde lange titel': correctedSubCase.correctie.procedurestapLangeTitel ? correctedSubCase.correctie.procedurestapLangeTitel : "",
              'Originele Procedurestapnaam': correctedSubCase.origineel.procedurestapNaam ? correctedSubCase.origineel.procedurestapNaam : "" ,
              'Gecorrigeerde Procedurestapnaam': correctedSubCase.correctie.procedurestapNaam ? correctedSubCase.correctie.procedurestapNaam : ""
            });
          }
        }
      }
      csv.sendCSV(corrections, req, res, `${name}.csv`);
    } else {
      res.send(correctedCases);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
