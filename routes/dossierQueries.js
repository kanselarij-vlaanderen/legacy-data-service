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

/* Returns an array of sourceIds that are normalized ()*/
const getSourceIds = function (sourceIdString) {
  let parsedSourceIds = [];
  if (sourceIdString) {
    parsedSourceIds = sourceIdString.split(/[;,]/).filter((id) => {
      return id.indexOf('VR/JJJJ/DD/MM') === -1;
    }).map((id) => {
      if (id.indexOf('/') > -1) {
        return id.substring(0, id.lastIndexOf('/'));
      }
      return id;
    }).map((id) => {
      if (id.toUpperCase().indexOf('BIS') > -1) {
        return id.substring(0, id.toUpperCase().lastIndexOf('BIS'));
      }
      return id;
    });
  }
  // remove duplicates for efficiency
  let sourceIds = [];
  for (const id of parsedSourceIds) {
    if (sourceIds.indexOf(id) === -1) {
      sourceIds.push(id);
    }
  }
  return sourceIds.map((id) => {
    return id.toUpperCase().trim();
  });;
};

/* Returns true if id1 contains id2 (case-insensitive) or vice-versa
OR if id1 and id2 both contain 'DOC', AND have matching year and identifier */
const docRegex = /[A-Z][A-Z] ([0-9][0-9][0-9][0-9]).*DOC\.([0-9][0-9][0-9][0-9]).*/;
const compareIds = function (id1, id2) {
  if (id1.indexOf('DOC') > -1 && id2.indexOf('DOC') > -1) {
    let doc1Ids = id1.match(docRegex);
    let doc2Ids = id2.match(docRegex);
    if (doc1Ids && doc2Ids && doc1Ids.length > 2 && doc1Ids.length === doc2Ids.length) {
      if (doc1Ids[1] === doc2Ids[1] && doc1Ids[2] === doc2Ids[2]) {
        return true;
      }
    }
  }
  return id1.toUpperCase().indexOf(id2.toUpperCase()) > -1 || id2.toUpperCase().indexOf(id1.toUpperCase()) > -1;
};

/* Adds a 'Valid' value to mainProcedurestap.valid if the dar_vorige ids are found withing the allProcedurestapppen array.
If not, the invalid reason is added to mainProcedurestap.valid */
const checkProcedureChain = function (mainProcedurestap, allProcedurestapppen) {
  // now we need to follow the dar_vorige identifiers.
  // check the dar_document_nr and/or object_name, at least one of the two must be non-empty AND NOT contain 'VR/JJJJ/DD/MM/',
  // AND be present in either dar_rel_docs or dar_vorige of all of the other procedurestappen
  let vorigeIds = getSourceIds(mainProcedurestap.dar_vorige);
  let remainingProcedurestappen = allProcedurestapppen.filter((remainingProcedurestap) => { return remainingProcedurestap.procedurestap !== mainProcedurestap.procedurestap; });
  if (remainingProcedurestappen.length > 0 && vorigeIds.length > 0) {
    let vorigeProcedurestappen = [];
    for (const procedurestap of remainingProcedurestappen) {
      for (const id of vorigeIds) {
        if (procedurestap.object_name && compareIds(procedurestap.object_name, id)) {
          vorigeProcedurestappen.push(procedurestap);
        }
      }
    }
    if (vorigeProcedurestappen.length === 0) {
      // as a last resort, we can check whether the object_name occurs somewhere else in the same dossier, which would also be valid
      let objectIds = getSourceIds(mainProcedurestap.object_name);
      let similarProcedurestappen = [];
      for (const procedurestap of remainingProcedurestappen) {
        for (const id of objectIds) {
          if (procedurestap.object_name && compareIds(procedurestap.object_name, id)) {
            similarProcedurestappen.push(procedurestap);
          }
        }
      }
      if (similarProcedurestappen.length === 0) {
        mainProcedurestap.valid = 'Invalid: no matching procedurestappen found for dar_vorige ' + vorigeIds + ' nor for object_name ' + objectIds;
      } else {
        mainProcedurestap.valid = 'Valid';
        for (const procedurestap of similarProcedurestappen) {
          checkProcedureChain(procedurestap, remainingProcedurestappen);
        }
      }
    } else {
      mainProcedurestap.valid = 'Valid';
      for (const procedurestap of vorigeProcedurestappen) {
        checkProcedureChain(procedurestap, remainingProcedurestappen);
      }
    }
  } else {
    mainProcedurestap.valid = 'Valid';
  }
};

const validateDossierChain = function (mainProcedurestap, procedurestappen) {
  if (mainProcedurestap) {
    checkProcedureChain(mainProcedurestap, procedurestappen);
    let dossierValidation = "";
    let unvalidatedProcedurestappen = [];
    for (const procedurestap of procedurestappen) {
      if (procedurestap.valid && procedurestap.valid !== 'Valid') {
        dossierValidation += procedurestap.valid + ';';
      } else if (!procedurestap.valid) {
        unvalidatedProcedurestappen.push(procedurestap);
      }
    }
    if (unvalidatedProcedurestappen.length > 0) {
      dossierValidation += 'Invalid: ' + unvalidatedProcedurestappen.length + ' procedurestappen not found in chain;';
    }
    if (dossierValidation.length > 0) {
      return dossierValidation.substring(0, dossierValidation.length - 1);
    } else {
      return 'Valid';
    }
  } else {
    // the title may be missing, or have been altered by someone. We need to try every procedurestap as "main", and check if it produces a valid chain
    return 'Invalid: main procedurestap not found';
  }
};

/* Returns a 'Valid' value if all the procedurestappen are valid.
If not, the invalid reason is returned. */
const validateDossier = function (dossier) {
  if (dossier) {
    // unfortunately we can't always find the "main" procedurestap, the one that was used to generate the dossier
    // the title may be missing, there may be duplicate titles, or the title have been altered by someone.
    // We need to try every procedurestap as "main", and check if it produces a valid chain
    let dossierValidations = [];
    for (const procedurestap of dossier.procedurestappen) {
      let dossierValidation = validateDossierChain(procedurestap, dossier.procedurestappen);
      // as soon as we find one correct chain of procedurestappen, we can stop
      if (dossierValidation === 'Valid') {
        dossierValidations.push(dossierValidation);
        break;
      } else {
        // store the invalid reason
        dossierValidations.push(dossierValidation);
      }
    }
    if (dossierValidations.indexOf('Valid') > -1) {
      dossier.mainProcedurestap = dossier.procedurestappen[dossierValidations.indexOf('Valid')];
      return 'Valid';
    } else {
      return 'Invalid: no correct chain of procedurestappen could be found.';
    }
  } else {
    return 'Invalid: no dossier';
  }
};

const getPotPourriDossiers = async function (limit, includeDorisProps, aantalProcedurestappen, sortOrder, validationMatch) {
  if (!includeDorisProps) {
    includeDorisProps = ['dar_document_nr','dar_vorige', 'dar_rel_docs', 'object_name'];// these are the ones we need for dossier-matching
  }
  let results = await getProcedureStappenInPotpourriDossiers(limit);
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
      let dorisRecords = dorisMetadata.lookup(dorisId);
      if (dorisRecords.length > 1) {
        // there are a few dorisIds that return multiple results, but only "dar_update" and "dar_pub_date" seem to differ, which doesn't matter for this analysis
        let unequalKeys = [];
        for (let i = 0; i < dorisRecords.length; i++) {
          // check all keys for equality (it could be just a double)
          for (var key in dorisRecords[i]) {
            if (dorisRecords[i].hasOwnProperty(key) && includeDorisProps.indexOf(key) > -1) {
              for (let j = 0; j < dorisRecords.length; j++) {
                if (unequalKeys.indexOf(key) === -1 && i !== j && dorisRecords[j][key] !== dorisRecords[i][key]) {
                  unequalKeys.push(key);
                }
              }
            }
          }
        }
        if (unequalKeys.length === 0) {
          dorisRecords = [dorisRecords[0]];
        } else {
          console.log('WARNING: multiple doris records ' + ' (' + dorisRecords.length + ')' + ' for ' + dorisId);
          console.log('unequal keys: ' + JSON.stringify(unequalKeys));
          for (const dorisRecord of dorisRecords) {
            console.log('====');
            console.log('---- dar_document_nr ' + dorisRecord.dar_document_nr);
            console.log('---- object_name ' + dorisRecord.object_name);
            console.log('---- dar_vorige ' + dorisRecord.dar_vorige);
            console.log('---- dar_rel_docs ' + dorisRecord.dar_rel_docs);
          }
        }
      }
      let dorisProps = {};
      for (const dorisProp of includeDorisProps) {
        dorisProps[dorisProp] = dorisRecords[0][dorisProp];
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
    resultArray[i] = {
      valid: validateDossier(resultArray[i]),
      ...resultArray[i]
    }
  }
  // filter out the valid/invalid results if needed
  if (validationMatch && validationMatch.length > 0) {
    if (validationMatch.toLowerCase() === 'valid') {
      resultArray = resultArray.filter((result) => { return result.valid.toLowerCase() === 'valid'; });
    } else {
      resultArray = resultArray.filter((result) => { return !result.valid || result.valid.toLowerCase().indexOf(validationMatch.toLowerCase()) > -1; });
    }
  }
  let stats = {
    'Totaal aantal dossiers': resultArray.length
  };
  for (const dossier of resultArray) {
    let statTitle = 'Aantal dossiers met ' + dossier.aantalProcedurestappen + ' procedurestappen';
    if (!stats[statTitle]) {
      stats[statTitle] = 0;
    }
    stats[statTitle]++;
  }
  if (!limit) {
    limit = resultArray.length;
  }
  resultArray = resultArray.slice(0, limit);
  return {
    stats: stats,
    dossiers: resultArray
  };
};

router.get('/mogelijke-potpourri-dossiers', async function(req, res) {
  try {
    let result = await getPotPourriDossiers(req.query.limit, req.query.dorisProps, req.query.aantalProcedurestappen, req.query.sortOrder, req.query.validationMatch);
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${result.dossiers.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(result.dossiers, req, res, `${name}.csv`, ['procedurestappen']);
    } else {
      res.send(result);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
