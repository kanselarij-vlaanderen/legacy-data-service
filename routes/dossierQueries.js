const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
import { getSimilarity, normalizeString } from '../util/similarity';
import csv from '../util/csv';
const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

const BASE_URL = 'https://kaleidos.vlaanderen.be';
// const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MAX_RESULTS = 100000000; // used for debugging pruposes
const defaultDorisProps = ['dar_document_nr','dar_vorige', 'dar_rel_docs', 'object_name', 'dar_keywords', 'dar_onderwerp', 'dar_aanvullend'];// these are the ones we need for dossier-matching

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
          let dorisRecord = dorisMetadata.lookup(dorisId);
          procedurestappen[result.procedurestap] = {
            procedurestap: result.procedurestap,
            aantalDossiers: result.count,
            dossiers: [],
            urls: [],
            titel: result.procedurestapTitle,
            dorisId: dorisId,
            dorisRecord: dorisRecord
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

/* Oplijsten alle dar_document_nr of mix dossiers */
router.get('/mix-document-nrs', async function(req, res) {
  try {
    let results = await getProcedureStappenWithMultipleDossiers(req.query.limit);
    // group the results by dar_document_nr
    let numbers = {};
    for (const result of results) {
      if (result.source) {
        let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
        let dorisRecord = dorisMetadata.lookup(dorisId);
        if (dorisRecord) {
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

/* Oplijsten & groeperen van alle procedurestappen in een mogelijk mix dossier */
const getProcedureStappenInMixDossiers = async function (limit) {
  const name = 'procedurestappen-in-mix-dossiers';
  const query = await queries.getQueryFromFile('/app/queries/procedurestappen_in_mix_dossiers.sparql');
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
  console.log('procedurestappen_in_mix_dossiers: ' + results.length + ' results.');
  return results;
};

const compareStrings = function (string1, string2) {
  if (string1 && string2) {
    if (string1.length > 3 && string2.length > 3 && normalizeString(string2).indexOf(normalizeString(string1)) > -1 || normalizeString(string1).indexOf(normalizeString(string2)) > -1) {
      if (normalizeString(string2) === normalizeString(string1)) {
        return 1;
      }
      return 0.9;
    }
    return getSimilarity(string1, string2);
  }
  return 0;
};

/* Get a 'real' chain of procedurestappen using dar_vorige, dar_aanvullend and dar_rel_docs */
const getProcedureChain = function (startProcedurestap, allProcedurestappen, currentChain, thresholds) {
  // we need to know which steps are already in the chain
  let newChain = [startProcedurestap];
  let newChainIds = [startProcedurestap.procedurestap];
  let currentChainIds = currentChain.map((procedurestap) => { return procedurestap.procedurestap; });
  // first we need to follow the dar_vorige & dar_rel_docs identifiers.
  let vorigeIds = dorisMetadata.getSourceIds(startProcedurestap.dar_vorige);
  let relDocIds = dorisMetadata.getSourceIds(startProcedurestap.dar_rel_docs);
  let aanvullendIds = dorisMetadata.getSourceIds(startProcedurestap.dar_aanvullend);
  // merge the two arrays
  let relevantIds = [];
  for (const id of vorigeIds) {
    if (relevantIds.indexOf(id) === -1) {
      relevantIds.push(id);
    }
  }
  for (const id of relDocIds) {
    if (relevantIds.indexOf(id) === -1) {
      relevantIds.push(id);
    }
  }
  for (const id of aanvullendIds) {
    if (relevantIds.indexOf(id) === -1) {
      relevantIds.push(id);
    }
  }
  // get all other procedurestappen not currently in the chain
  let remainingProcedurestappen = allProcedurestappen.filter((remainingProcedurestap) => {
    return currentChainIds.indexOf(remainingProcedurestap.procedurestap) === -1 && remainingProcedurestap.procedurestap !== startProcedurestap.procedurestap;
  });
  if (remainingProcedurestappen.length > 0 && relevantIds.length > 0) {
    let relevantProcedurestappen = [];
    // check the object_name and dar_rel_docs of all other procedurestappen
    for (const procedurestap of remainingProcedurestappen) {
      let added = false;
      for (const id of relevantIds) {
        // in most cases, the id we're looking for should be found in the object_name
        if (!added && procedurestap.object_name && dorisMetadata.compareIds(procedurestap.object_name, id)) {
          relevantProcedurestappen.push(procedurestap);
          added = true;
        }
        // the id can also be in dar_rel_docs in some cases
        if (!added && procedurestap.dar_rel_docs) {
          const relDocIds = dorisMetadata.getSourceIds(procedurestap.dar_rel_docs);
          for (const relDocId of relDocIds) {
            if (dorisMetadata.compareIds(relDocId, id)) {
              relevantProcedurestappen.push(procedurestap);
              added = true;
            }
          }
        }
      }
    }
    if (relevantProcedurestappen.length > 0) {
      // we found links to other procedurestappen further down the chain, which may have their own links
      for (const procedurestap of relevantProcedurestappen) {
        const procedureChain = getProcedureChain(procedurestap, remainingProcedurestappen, [...currentChain, ...newChain], thresholds);
        for (const chainProcedurestap of procedureChain) {
          if (newChainIds.indexOf(chainProcedurestap.procedurestap) === -1) {
            newChain.push(chainProcedurestap);
            newChainIds.push(chainProcedurestap.procedurestap);
          }
        }
      }
    }
  }
  // if there are no more procedurestappen or relevantIds, we can stop and return the chain
  return newChain;
};

// We'll assume the largest chain in the dossier as the 'correct' one, and compare the remaining steps to those in the chain
// If the object_name, title, dar_keywords, and/or dar_onderwerp match up acceptably, we'll call it valid.
const validateIncompleteChain = function (dossier, strict, tolerance, thresholds) {
  if (dossier.maxChain && dossier.startProcedurestap) {
    const startProcedurestap = dossier.startProcedurestap;
    // get the current correct chain, and the remaining procedurestappen
    const correctChain = dossier.maxChain;
    let remainingProcedurestappen = dossier.procedurestappen.filter((procedurestap) => {
      for (const correctProcedurestap of correctChain) {
        if (correctProcedurestap.procedurestap === procedurestap.procedurestap) {
          return false;
        }
      }
      return true;
    });
    dossier.remainingProcedurestappen = remainingProcedurestappen;
    // get some useful information about the correct chain
    const relevantProcedurestappen = [];
    let relevantIds = [];
    let relevantTitles = [];
    let relevantSubjects = [];
    let relevantKeywords = [];
    for (const correctProcedurestap of correctChain) {
      let sourceIds = dorisMetadata.getSourceIds(correctProcedurestap.object_name);
      for (const sourceId of sourceIds) {
        if (relevantIds.indexOf(sourceId) === -1) {
          relevantIds.push(sourceId);
        }
      }
      if (correctProcedurestap.titel && correctProcedurestap.titel.length > 0 && relevantTitles.indexOf(correctProcedurestap.titel) === -1) {
        relevantTitles.push(correctProcedurestap.titel);
      }
      if (correctProcedurestap.dar_onderwerp && correctProcedurestap.dar_onderwerp.length > 0 && relevantSubjects.indexOf(correctProcedurestap.dar_onderwerp) === -1) {
        relevantSubjects.push(correctProcedurestap.dar_onderwerp);
      }
      if (correctProcedurestap.dar_keywords && correctProcedurestap.dar_keywords.length > 0 && relevantKeywords.indexOf(correctProcedurestap.dar_keywords) === -1) {
        relevantKeywords.push(correctProcedurestap.dar_keywords);
      }
    };

    for (const procedurestap of remainingProcedurestappen) {
      let added = false;
      procedurestap.maxSimScores = {};
      // First we can check whether the object_name of a link in the chain occurs somewhere else in the same dossier,
      // which would also be valid
      for (const id of relevantIds) {
        if (procedurestap.object_name && dorisMetadata.compareIds(procedurestap.object_name, id)) {
          if (procedurestap.maxSimScores.object_name === undefined) {
            procedurestap.maxSimScores.object_name = 0;
          }
          if (!added && relevantProcedurestappen.indexOf(procedurestap.procedurestap) === -1) {
            relevantProcedurestappen.push(procedurestap.procedurestap);
            procedurestap.maxSimScores.object_name = 1;
            added = true;
          }
        }
      }
      // we're now entering fuzzy territory... compareStrings returns a value between 0 and 1, and thresholds determines how strict we are.
      // Finally, we can check whether the title, dar_onderwerp and/or keywords occur somewhere else in the same dossier, which would likely also be valid
      // it's important we err on the side of caution here. So don't set the threshold too high, or valid dossiers might get deleted
      for (const title of relevantTitles) {
        let score = compareStrings(procedurestap.titel, title);
        if (procedurestap.maxSimScores.title === undefined || score > procedurestap.maxSimScores.title) {
          procedurestap.maxSimScores.title = score;
        }
        if (score >= thresholds.title) {
          if (!added && relevantProcedurestappen.indexOf(procedurestap.procedurestap) === -1) {
            relevantProcedurestappen.push(procedurestap.procedurestap);
            added = true;
          }
        }
      }

      for (const subject of relevantSubjects) {
        let score = compareStrings(procedurestap.dar_onderwerp, subject);
        if (procedurestap.maxSimScores.subject === undefined || score > procedurestap.maxSimScores.subject) {
          procedurestap.maxSimScores.subject = score;
        }
        if (score >= thresholds.subject) {
          if (!added && relevantProcedurestappen.indexOf(procedurestap.procedurestap) === -1) {
            relevantProcedurestappen.push(procedurestap.procedurestap);
            added = true;
          }
        }
      }

      for (const keywords of relevantKeywords) {
        let score = compareStrings(procedurestap.dar_keywords, keywords);
        if (procedurestap.maxSimScores.keywords === undefined || score > procedurestap.maxSimScores.keywords) {
          procedurestap.maxSimScores.keywords = score;
        }
        if (score >= thresholds.keywords) {
          if (!added && relevantProcedurestappen.indexOf(procedurestap.procedurestap) === -1) {
            relevantProcedurestappen.push(procedurestap.procedurestap);
            added = true;
          }
        }
      }
    }

    dossier.relevantProcedurestappen = relevantProcedurestappen;
    if (dossier.relevantProcedurestappen.length > 0) {
      for (let i = 0; i < dossier.remainingProcedurestappen.length; i++) {
        if (dossier.relevantProcedurestappen.indexOf(dossier.remainingProcedurestappen[i].procedurestap) > -1) {
          dossier.remainingProcedurestappen.splice(i, 1);
          i--;
        }
      }
    }
  }
};


const validateDossierByChains = function (dossier, strict, tolerance, thresholds) {
  if (!tolerance) {
    tolerance = 0;
  }
  if (dossier) {
    // unfortunately we can't always find the "main" procedurestap, the one that was used to generate the dossier
    // the title may be missing, there may be duplicate titles, or the title have been altered by someone.
    // We need to try every procedurestap as "main", and check if it produces a valid chain
    for (const procedurestap of dossier.procedurestappen) {
      procedurestap.chain = getProcedureChain(procedurestap, dossier.procedurestappen, [], thresholds);
    }
    // now we can check whether there is a procedurestap that leads to a chain that includes all other procedurestappen
    let maxChain = undefined;
    let startProcedurestap = undefined;
    for (const procedurestap of dossier.procedurestappen) {
      if (procedurestap.chain && procedurestap.chain.length === dossier.procedurestappen.length) {
        dossier.chain = procedurestap.chain;
        dossier.startProcedurestap = procedurestap;
        return 'Valid';
      } else {
        if (!maxChain || (procedurestap.chain && maxChain.length < procedurestap.chain.length)) {
          maxChain = procedurestap.chain;
          dossier.startProcedurestap = procedurestap;
        }
      }
    }
    dossier.maxChain = maxChain;

    // if we got here, there's no full chain in the dossier. We can perform some other checks to see if the dossier is valid anyway
    validateIncompleteChain(dossier, strict, tolerance, thresholds);
    if (dossier.remainingProcedurestappen && dossier.remainingProcedurestappen.length === 0) {
      return 'Valid (with relevant procedurestappen in incomplete chain)';
    }

    if (!strict) {
      if (dossier.maxChain.length >= dossier.procedurestappen.length - tolerance) {
        return 'Valid (disregarding ' + tolerance + ' step' + (tolerance > 1 ? 's' : '') + ')';
      }
      for (const procedurestap of dossier.procedurestappen) {
        if (procedurestap.dar_vorige && procedurestap.dar_vorige.length > 0) {
          return 'Invalid: no complete chain of procedurestappen found.';
        }
      }
    }
    return 'Invalid: no complete chain of procedurestappen found.';
  } else {
    return 'Invalid: no dossier';
  }
}

const getAantalDossiersForProcedurestap = async function (procedurestap) {
  const aantalDossiersQuery = `PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  SELECT COUNT(DISTINCT ?dossier) as ?aantalDossiers WHERE {
    ?dossier dossier:doorloopt <${procedurestap}> .
  }`;
  let result = await kaleidosData.executeQuery(aantalDossiersQuery);
  if (result && result[0]) {
    return result[0].aantalDossiers;
  }
  return 0;
};

const getMixDossiers = async function (limit, includeDorisProps, aantalProcedurestappen, sortOrder, validationMatch, strict, tolerance, thresholds, progressiveThresholds, progressiveThresholdStep, progressiveThresholdProcedurestappenStep) {
  if (!includeDorisProps) {
    includeDorisProps = defaultDorisProps;
  }
  if (tolerance === undefined || isNaN(tolerance)) {
    tolerance = 0;
  }
  if (progressiveThresholds) {
    if (!progressiveThresholdStep || isNaN(progressiveThresholdStep)) {
      progressiveThresholdStep = 0.05;
    }
    if (!progressiveThresholdProcedurestappenStep || isNaN(progressiveThresholdProcedurestappenStep)) {
      progressiveThresholdProcedurestappenStep = 10;
    }
  }
  let results = await getProcedureStappenInMixDossiers(limit);
  // group the results by dossier
  let dossiers = {};
  for (const result of results) {
    if (result.dossier) {
      const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
      if (!dossiers[result.dossier]) {
        dossiers[result.dossier] = {
          dossier: result.dossier,
          titel: result.dossierTitle,
          identifier: result.dossierIdentifier,
          url: `${BASE_URL}/dossiers/${dossierId}/deeldossiers`,
          procedurestappen: [],
          aantalProcedurestappen: 0
        };
      }
      let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
      let dorisRecord = dorisMetadata.lookup(dorisId, includeDorisProps);
      let dorisProps = {};
      if (dorisRecord) {
        for (const dorisProp of includeDorisProps) {
          dorisProps[dorisProp] = dorisRecord[dorisProp];
        }
      }
      dossiers[result.dossier].procedurestappen.push({
        procedurestap: result.procedurestap,
        aantalDossiers: result.count,
        url: result.url,
        titel: result.procedurestapTitle,
        dorisId: dorisId,
        ...dorisProps
      });
      dossiers[result.dossier].aantalProcedurestappen++;
    }
  }
  let resultArray = [];
  for (const dossierUrl in dossiers) {
    if (dossiers.hasOwnProperty(dossierUrl)) {
      // filter by aantalProcedurestappen
      if (aantalProcedurestappen && !isNaN(aantalProcedurestappen)) {
        if (dossiers[dossierUrl].aantalProcedurestappen === +aantalProcedurestappen) {
          resultArray.push(dossiers[dossierUrl]);
        }
      } else {
        resultArray.push(dossiers[dossierUrl]);
      }
    }
  }
  sortOrder = sortOrder ? sortOrder.toLowerCase() : 'desc';
  resultArray.sort((a, b) => {
    if (sortOrder === 'asc') {
      return a.aantalProcedurestappen - b.aantalProcedurestappen;
    } else {
      return b.aantalProcedurestappen - a.aantalProcedurestappen;
    }
  });
  for (let i = 0; i < resultArray.length; i++) {
    let dossierThresholds = { ...thresholds };
    if (progressiveThresholds) {
      for (const key in dossierThresholds) {
        if (dossierThresholds.hasOwnProperty(key)) {
          let multiplier = Math.floor(resultArray[i].aantalProcedurestappen / progressiveThresholdProcedurestappenStep);
          dossierThresholds[key] += progressiveThresholdStep * multiplier;
          if (dossierThresholds[key] > 1) {
            dossierThresholds[key] = 1;
          }
        }
      }
    }
    let dossierIsValid = validateDossierByChains(resultArray[i], strict, tolerance, dossierThresholds);

    // some mapping to avoid circular JSON structure
    if (resultArray[i].maxChain) {
      resultArray[i].maxChain = resultArray[i].maxChain.map((procedurestap) => { return procedurestap.procedurestap; });
    }
    for (let procedurestap of resultArray[i].procedurestappen) {
      if (procedurestap.chain) {
        procedurestap.chain = procedurestap.chain.map((chainProcedurestap) => { return chainProcedurestap.procedurestap; });
      }
    }

    resultArray[i] = {
      valid: dossierIsValid,
      thresholds: dossierThresholds,
      ...resultArray[i]
    }
  }
  // filter out the valid/invalid results if needed
  if (validationMatch && validationMatch.length > 0) {
    if (validationMatch.toLowerCase() === 'valid') {
      resultArray = resultArray.filter((result) => { return result.valid.toLowerCase() === 'valid' || result.valid.toLowerCase() === 'valid (not strict)'; });
    } else {
      resultArray = resultArray.filter((result) => { return (!result.valid || result.valid.toLowerCase().indexOf(validationMatch.toLowerCase()) > -1); });
    }
  }
  let stats = {
    'Totaal aantal dossiers': resultArray.length,
    thresholds: thresholds
  };
  let totaalAantalProcedurestappen = 0;
  for (const dossier of resultArray) {
    let statTitle = 'Aantal dossiers met ' + dossier.aantalProcedurestappen + ' procedurestappen';
    if (!stats[statTitle]) {
      stats[statTitle] = 0;
    }
    stats[statTitle]++;
    totaalAantalProcedurestappen += dossier.aantalProcedurestappen;
    for (const procedurestap of dossier.procedurestappen) {
      procedurestap.aantalDossiers = await getAantalDossiersForProcedurestap(procedurestap.procedurestap);
      if (!dossier.maxAantalDossiersPerProcedurestap || procedurestap.aantalDossiers > dossier.maxAantalDossiersPerProcedurestap) {
        dossier.maxAantalDossiersPerProcedurestap = procedurestap.aantalDossiers;
      }
      if (!dossier.minAantalDossiersPerProcedurestap || procedurestap.aantalDossiers < dossier.minAantalDossiersPerProcedurestap) {
        dossier.minAantalDossiersPerProcedurestap = procedurestap.aantalDossiers;
      }
    }
  }
  stats.totaalAantalProcedurestappen = totaalAantalProcedurestappen;
  if (!limit) {
    limit = resultArray.length;
  }
  resultArray = resultArray.slice(0, limit);
  return {
    stats: stats,
    dossiers: resultArray
  };
};

router.get('/mogelijke-mix-dossiers', async function(req, res) {
  try {
    let thresholds = {
      title: req.query.titleThreshold !== undefined ? +req.query.titleThreshold : 0.1,
      subject: req.query.subjectThreshold !== undefined ? +req.query.subjectThreshold : 0.1,
      keywords: req.query.keywordsThreshold !== undefined ? +req.query.keywordsThreshold : 0.7,
    };
    let result = await getMixDossiers(req.query.limit, req.query.dorisProps, req.query.aantalProcedurestappen, req.query.sortOrder, req.query.validationMatch, req.query.strict === 'true', +req.query.tolerance, thresholds, req.query.progressiveThresholds === 'true', +req.query.progressiveThresholdStep, +req.query.progressiveThresholdProcedurestappenStep);
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${result.dossiers.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(result.dossiers, req, res, `${name}.csv`, ['valid', 'thresholds', 'identifier', 'procedurestappen', 'startProcedurestap', 'maxChain', 'remainingProcedurestappen', 'relevantProcedurestappen']);
    } else {
      res.send(result);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

// this route is primarily to use to generate a CSV for inspection
router.get('/mogelijke-mix-dossiers-procedurestappen', async function(req, res) {
  try {
    let thresholds = {
      title: req.query.titleThreshold !== undefined ? +req.query.titleThreshold : 0.1,
      subject: req.query.subjectThreshold !== undefined ? +req.query.subjectThreshold : 0.1,
      keywords: req.query.keywordsThreshold !== undefined ? +req.query.keywordsThreshold : 0.7,
    };
    let result = await getMixDossiers(req.query.limit, req.query.dorisProps, req.query.aantalProcedurestappen, req.query.sortOrder, req.query.validationMatch, req.query.strict === 'true', +req.query.tolerance, thresholds, req.query.progressiveThresholds === 'true', +req.query.progressiveThresholdStep, +req.query.progressiveThresholdProcedurestappenStep);
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${result.dossiers.length} results`);
    if (req.query && req.query.csv) {
      let csvResults = [];
      for (const dossier of result.dossiers) {
        csvResults.push({
          'Dossier titel': dossier.titel,
          'Dossier url': dossier.url,
          'Aantal procedurestappen in dossier': dossier.aantalProcedurestappen,
          'Minimum aantal dossiers per procedurestap': dossier.minAantalDossiersPerProcedurestap
        });
        for (const procedurestap of dossier.procedurestappen) {
          csvResults.push({
            'Procedurestap titel': procedurestap.titel,
            'Procedurestap url': procedurestap.url,
            'Aantal dossiers waar deze procedurestap in voorkomt': procedurestap.aantalDossiers,
            'DORIS onderwerp': procedurestap.dar_onderwerp,
            'DORIS kernwoorden': procedurestap.dar_keywords
          });
        }
      }
      csv.sendCSV(csvResults, req, res, `${name}.csv`, []);
    } else {
      res.send(result);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

router.get('/mogelijke-gesplitte-dossiers', async function(req, res) {
  try {
    const name = 'mogelijke-gesplitte-dossiers';
    const query = await queries.getQueryFromFile('/app/queries/mogelijke_gesplitte_dossiers.sparql');
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const dossierId = result.dossier.substring(result.dossier.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/dossiers/${dossierId}/deeldossiers`;
      }
      await caching.writeLocalFile(name, results);
    }
    console.log('mogelijke_gesplitte_dossiers: ' + results.length + ' results.');
    res.send(results);
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
