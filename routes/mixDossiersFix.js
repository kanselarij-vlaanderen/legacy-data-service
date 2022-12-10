const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
import csv from '../util/csv';
import { uuid } from 'mu';

/*
  Deze library bevat routes en functies om de mixdossiers te fixen volgens KAS-3649 en KAS-3650.
  http://localhost:8889/mixdossiers-fix-get-alle-dossiers geeft een overzicht van alle dossiers die door deze fix worden gehaald.

  Opmerking 1: Hierbij zijn er enkele dossiers en procedurestappen buiten beschouwing gelaten, omdat het speciale gevallen zijn,
  aangezien deze dossiers ook procedurestappen bevatten van na de start van Kaleidos. We gaan er dus van uit dat deze sowieso correct zijn bevonden.
  De lijst van deze dossiers wordt via getExceptions() opgehaald.

  Opmerking 2: er zijn een heel aantal procedurestappen verkeerd geïmporteerd of ooit foutief gemigreerd.
  Deze procedurestappen hebben geen properties, en zijn dus leeg. Deze mogen sowieso verwijderd worden.
  De lijst van dossiers met deze procedurestappen wordt opgehaald met flaggedCases().

  /mixdossiers-fix-get-alle-dossiers geeft een lijst van alle pre-kaleidos dossiers, min de uitzonderingen.
  M.a.w. in deze lijst staan alle dossiers die we zullen behandelen met deze fix.
  Hierbij halen we ook de originele DORIS records op voor de procedurestappen.

  Stap 1 (KAS-3649) is het opsplitsen van alle pre-kaleidos dossiers in dossiers met welgeteld 1 enkele procedurestap, en alle andere dossiers verwijderen.


  /mixdossiers-fix geeft een object met volgende properties terug:
  {
    casesToDelete: array van dossiers die mogen worden verwijderd (m.a.w. de URI + alle triples er van en naar),
    decisionFlowsToDelete: array van besluitvormingsaangelegenheden die mogen worden verwijderd (m.a.w. de URI + alle triples er van en naar),
    publicationFlowsToDelete: array van publicatiedossiers die mogen worden verwijderd (m.a.w. de URI + alle triples er van en naar),
    casesToKeep: array van dossiers die mogen blijven (sowieso alle uitzonderingen),
    decisionFlowsToKeep: array van besluitvormingsaangelegenheden die mogen blijven,
    publicationFlowsToKeep: array van publicatiedossiers die mogen blijven,
    toInsert: array van objecten met volgende structuur:
      {
        uri: // nieuwe URI voor dit dossier,
        title:
        shortTitle:
        created:
        number:
        isArchived:
        pieces:
        decisionFlow: {
          uri: // nieuwe URI voor de besluitvormingsaangelegenheid
          title:
          shortTitle:
          opened:
          closed:
          governmentAreas:
          subcases: [] // array of subcase URIs
        }
      }
  }
*/

const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';
// const BASE_URL = 'https://kaleidos.vlaanderen.be';
const BASE_URL = 'http://localhost';

const MAX_RESULTS = 100000000; // used for debugging purposes, ignore this

const CASE_BASE_URI = 'http://themis.vlaanderen.be/id/dossier/';
const DECISIONFLOW_BASE_URI = 'http://themis.vlaanderen.be/id/besluitvormingsaangelegenheid/';

/* Oplijsten van alle procedurestappen van voor de start van kaleidos */
const getPreKaleidosSubcases = async function (limit) {
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

/* Oplijsten van de dossiers die ook procedurestappen hebben van na de start van Kaleidos. Deze willen we laten zoals ze zijn. */
const getExceptions = async function (limit) {
  // Eerst alle pre-kaleidos dossiers ophalen met een procedurestap met meer post-kaleidos geplandeStart
  const name = 'legacy-dossiers-met-nieuwere-procedurestappen';
  const query = await queries.getQueryFromFile('/app/queries/legacy_dossiers_met_nieuwere_procedurestappen.sparql');
  let results = await caching.getLocalJSONFile(name);
  if (!results) {
    results = await kaleidosData.executeQuery(query, limit);
    await caching.writeLocalFile(name, results);
  }
  // we halen apart alle procedurestappen voor deze dossiers op, want deze zijn voor de rest van de fix off-limits
  let subcases = [];
  for (const result of results) {
    let subcasesForCase = await kaleidosData.getProcedureStappenForDossier(result.dossier);
    for (const subcase of subcasesForCase) {
      if (subcases.indexOf(subcase.procedurestap) === -1) {
        subcases.push(subcase.procedurestap);
      }
    }
  }
  return {
    cases: results.map((result) => { return result.dossier; }), // alle dossiers die off-limits zijn
    subcases: subcases // alle procedurestappen die off-limits zijn
  };
};

/* Lijst van foute dossiers met procedurestappen die sowieso uit Kaleidos moeten gehaald worden (worden nu ook al nooit weergegeven aangezien ze geen properties hebben).
  Resultaat bevat een object met dossier url als keys, en als value:
  {
    procedurestappen: de gevlagde procedurestappen,
    besluitvormingsaangelegenheid: de besluitvormingsaangelegenheid url,
    dossier: de dossier url,
    publicatieDossiers: array met publicatiedossiers,
    url: kaleidos url voor de besluitvormingsaangelegenheid
  }
*/
const getFlaggedCases = async function (limit, exceptions) {
  const name = 'fout-gemigreerde-procedurestappen';
  const query = await queries.getQueryFromFile('/app/queries/fout_gemigreerde_procedurestappen.sparql');
  let results = await caching.getLocalJSONFile(name);
  if (!results) {
    results = await kaleidosData.executeQuery(query, limit);
    await caching.writeLocalFile(name, results);
  }
  // groepeer results per dossier
  let cases = {};
  let subcaseCount = 0;
  for (const result of results) {
    if (result.dossier && exceptions.cases.indexOf(result.dossier) === -1) { // keep the cases that have newer subcases out of this fix
      if (!cases[result.dossier]) {
        const besluitvormingsaangelegenheidId = result.besluitvormingsaangelegenheid.substring(result.besluitvormingsaangelegenheid.lastIndexOf('/') + 1);
        cases[result.dossier] = {
          dossier: result.dossier,
          besluitvormingsaangelegenheid: result.besluitvormingsaangelegenheid,
          publicatieDossiers: [],
          url: `${BASE_URL}/dossiers/${besluitvormingsaangelegenheidId}/deeldossiers`,
          procedurestappen: []
        };
      }
      // NOTE: deze hebben sowieso geen DORIS id, want de procedurestappen hebben geen properties, en dus ook geen dct:source
      let foundSubcase = false;
      for (let i = 0; !foundSubcase && i < cases[result.dossier].procedurestappen.length; i++) {
        if (cases[result.dossier].procedurestappen[i].procedurestap === result.procedurestap) {
          foundSubcase = true;
        }
      }
      if (!foundSubcase) {
        cases[result.dossier].procedurestappen.push({
          procedurestap: result.procedurestap,
          faulty: true
        });
        subcaseCount++;
      }
      if (result.publicatieDossier && cases[result.dossier].publicatieDossiers.indexOf(result.publicatieDossier) === -1) {
        cases[result.dossier].publicatieDossiers.push(result.publicatieDossier);
      }
    } else if (result.dossier && exceptions.cases.indexOf(result.dossier) > -1) {
      throw "Exception in faulty case!"
    }
  }
  console.log(subcaseCount + ' fout gemigreerde procedurestappen.');
  return cases;
};


/* Alle procedurestappen van voor kaleidos groeperen per dossier */
const getDossiers = async function (limit) {
  let results = await getPreKaleidosSubcases(limit);
  let exceptions = await getExceptions(); // exceptions bevat 2 arrays: cases and subcases
  // groepeer results per dossier
  let cases = {};
  let undefinedDorisIds = [];// gebruikt om te kijken hoeveel informatie in DORIS we missen
  for (const result of results) {
    if (result.dossier && exceptions.cases.indexOf(result.dossier) === -1) { // keep the cases that have newer subcases out of this fix
      if (!cases[result.dossier]) {
        const besluitvormingsaangelegenheidId = result.besluitvormingsaangelegenheid.substring(result.besluitvormingsaangelegenheid.lastIndexOf('/') + 1);
        cases[result.dossier] = {
          dossier: result.dossier,
          besluitvormingsaangelegenheid: result.besluitvormingsaangelegenheid,
          publicatieDossiers: [],
          url: `${BASE_URL}/dossiers/${besluitvormingsaangelegenheidId}/deeldossiers`,
          procedurestappen: []
        };
      }
      // procedurestappen met doris info
      let dorisId = result.source ? result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '') : undefined;
      if (dorisId && dorisId.indexOf('/') > -1) {
        console.log('***************');
        console.log('WARNING: dorid id ' + dorisId + ' is not what we expected');
        console.log('***************');
      } else if (!dorisId) {
        undefinedDorisIds.push(result);
      }
      let dorisRecord = dorisMetadata.lookup(dorisId);
      let foundSubcase = false;
      for (let i = 0; !foundSubcase && i < cases[result.dossier].procedurestappen.length; i++) {
        if (cases[result.dossier].procedurestappen[i].procedurestap === result.procedurestap) {
          foundSubcase = true;
        }
      }
      if (!foundSubcase) {
        cases[result.dossier].procedurestappen.push({
          procedurestap: result.procedurestap,
          dorisId: dorisId,
          dorisRecord: dorisRecord
        });
      }
      // publicaties
      if (result.publicatieDossier && cases[result.dossier].publicatieDossiers.indexOf(result.publicatieDossier) === -1) {
        cases[result.dossier].publicatieDossiers.push(result.publicatieDossier);
      }
      // check for some data inconsistencies
      if (cases[result.dossier].besluitvormingsaangelegenheid !== result.besluitvormingsaangelegenheid) {
        throw "There is more than 1 decisionFlow for a case. This shouldn't happen!";
      }
    }
  }
  // deze moeten we apart toevoegen aan de dossiers, want deze procedurestappen zaten niet in de originele query (ze hebben geen agendering zoals het moet)
  let flaggedCases = await getFlaggedCases(limit, exceptions);
  let flaggedSubcaseCount = 0;
  let flaggedPubflowCount = 0;
  let newCaseCount = 0;
  let existingCaseCount = 0;
  for (const dossierUrl in flaggedCases) {
    if (cases[dossierUrl]) {
      existingCaseCount++;
      // dit dossier zat al in de oorspronkelijke query, merge de procedurestappen en publicatieDossiers
      for (const procedurestap of flaggedCases[dossierUrl].procedurestappen) {
        let foundSubcase = false;
        for (let i = 0; !foundSubcase && i < cases[dossierUrl].procedurestappen.length; i++) {
          if (cases[dossierUrl].procedurestappen[i].procedurestap === procedurestap.procedurestap) {
            foundSubcase = true;
          }
        }
        if (!foundSubcase) {
          cases[dossierUrl].procedurestappen.push(procedurestap);
          flaggedSubcaseCount++;
        }
      }
      for (const publicatieDossier of flaggedCases[dossierUrl].publicatieDossiers) {
        if (cases[dossierUrl].publicatieDossiers.indexOf(publicatieDossier) === -1) {
          cases[dossierUrl].publicatieDossiers.push(publicatieDossier);
          flaggedPubflowCount++;
        }
      }
    } else {
      // maak een nieuwe record aan voor dit dossier
      const besluitvormingsaangelegenheidId = flaggedCases[dossierUrl].besluitvormingsaangelegenheid.substring(flaggedCases[dossierUrl].besluitvormingsaangelegenheid.lastIndexOf('/') + 1);
      cases[dossierUrl] = {
        dossier: flaggedCases[dossierUrl].dossier,
        besluitvormingsaangelegenheid: flaggedCases[dossierUrl].besluitvormingsaangelegenheid,
        publicatieDossiers: [],
        url: `${BASE_URL}/dossiers/${besluitvormingsaangelegenheidId}/deeldossiers`,
        procedurestappen: flaggedCases[dossierUrl].procedurestappen
      }
      newCaseCount++;
    }
  }
  console.log(newCaseCount + ' flagged cases were added to the result set');
  console.log(flaggedSubcaseCount + ' flagged subcases were merged into the existing result set');
  console.log(flaggedPubflowCount + ' flagged publication flows were merged into the existing result set');
  const resultArray = [];
  for (const dossierUrl in cases) {
    if (cases.hasOwnProperty(dossierUrl)) {
      cases[dossierUrl].aantalProcedurestappen = cases[dossierUrl].procedurestappen.length;
      resultArray.push(cases[dossierUrl]);
    }
  }
  console.log('There were ' + undefinedDorisIds.length + ' subcases with undefined doris sources.');
  return resultArray.sort((a, b) => { return b.procedurestappen.length - a.procedurestappen.length; }).slice(0, limit ? +limit : resultArray.length);
};

/* Oplijsten alle verkeerd geimporteerde procedurestappen pre-kaleidos */
router.get('/mixdossiers-fix-get-foute-dossiers', async function(req, res) {
  try {
    let cases = await getFlaggedCases(+req.query.limit, await getExceptions())
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${Object.keys(cases).length} results`);
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

/* Oplijsten alle procedurestappen pre-kaleidos */
router.get('/mixdossiers-fix-get-alle-dossiers', async function(req, res) {
  try {
    let cases = await getDossiers(+req.query.limit)
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${cases.length} results`);
    if (req.query && req.query.csv) {
      csv.sendCSV(cases, req, res, `${name}.csv`, []);
    } else {
      res.send(cases.slice(0, req.query.limit ? +req.query.limit : cases.length));
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

/* This generates a mapping of 1 unique case per subcase, containing a decision flow with only that subcase, as well as a list of which subcase links to remove.
We're not adding uuids or generating URIs yet, as these results will be used in a later stage to cluster the relevant subcases. */
const getSingleSubcaseCases = async function (limit) {
  let cases = await getDossiers(limit); // hier zitten de foute procedurestappen bij, die er sowieso uit moeten
  console.log(cases.length + ' dossiers opgehaald');
  // fix eerst deze fouten
  let removeFaultyLinks = [];
  for (let i = 0; i < cases.length; i++) {
    for (var j = 0; j < cases[i].procedurestappen.length; j++) {
      if (cases[i].procedurestappen[j].faulty) {
        removeFaultyLinks.push(`<${cases[i].besluitvormingsaangelegenheid}> dossier:doorloopt <${cases[i].procedurestappen[j].procedurestap}>`); // markeer voor verwijdering
        cases[i].procedurestappen.splice(j, 1); // verwijder deze procedurestap voor de rest van deze functie
        j--; // zet de index eentje terug
      }
    }
  }
  console.log(removeFaultyLinks.length + ' procedurestappen links zijn fout en zullen worden verwijderd.');
  let subcaseCaseMapping = {}; // keep track of which cases/decisionflows were added for each subcase. We'll store the kaleidos url in here for convenience
  let toRemove = [];
  let doubleSubcaseCount = 0;
  let pubCount = 0;
  let noPubCount = 0;
  let newCaseCount = 0;
  let keptCaseCount = 0;
  for (let i = 0; i < cases.length; i++) {
    if (cases[i].procedurestappen.length === 1) {
      // check if we already added this subcase
      if (subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap]) {
        // NOTE: This happened because we already created a new case for this in the next step (split out of a bigger case)
        // We should replace that case with this existing one
        if (cases[i].url && !subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].url) {
          subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
        } else if (cases[i].url && subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].url) {
          // NOTE: dit gebeurt omdat er 2 dossiers zijn waaruit foute procedurestappen zijn gefilterd, en beide nu slechts 1 juiste procedurestap overhouden.
          // Hier kunnen we op basis van de properties van het dossier kiezen dewelke te houden
          const subcaseTitle = await kaleidosData.getTitleForSubject(cases[i].procedurestappen[0].procedurestap);
          const currentTitle = await kaleidosData.getTitleForSubject(cases[i].dossier);
          const existingTitle = await kaleidosData.getTitleForSubject(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].dossier);
          // indien er een publicatie is bij 1 dossier, hou die sowieso
          if (cases[i].publicatieDossiers.length > 0) {
            toRemove.push(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap]);
            subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
          } else if (subcaseTitle !== existingTitle && subcaseTitle === currentTitle) {
            // als de titel matcht met de procedurestap, hou dan dat dossier.
            toRemove.push(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap]);
            subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
          } else {
            // verwijder dit dossier.
            toRemove.push(cases[i]);
          }
          // detecteer de verschillen tussen deze besluitvormingsaangelegenheden
          // let differentTriples = await kaleidosData.compareResources(cases[i].besluitvormingsaangelegenheid, subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].besluitvormingsaangelegenheid);
          // console.log('Differing triples:');
          // console.log(differentTriples);
          // Wat statistieken voor debugging
          doubleSubcaseCount++;
          if (cases[i].publicatieDossiers.length) {
            pubCount++
          } else {
            noPubCount++;
          }

          console.log('---------');
          console.log('WARNING: double single subcase ' + cases[i].procedurestappen[0].procedurestap + ' : ' + subcaseTitle);
          console.log('Appears in: ');
          console.log(cases[i].url +
            ' (' + cases[i].procedurestappen.length + ' procedurestappen)' +
            ' (' + cases[i].publicatieDossiers.length + ' publications)' +
            ' case: ' + cases[i].dossier + ' : ' + currentTitle
          );
          console.log(subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].url +
            ' (' + subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].procedurestappen.length + ' procedurestappen)' +
            ' (' + subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].publicatieDossiers.length + ' publications)' +
            ' case: ' + subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap].dossier + ' : ' + existingTitle
          );
        } else {
          // this stays a new case, no need to add it again
        }
      } else {
        subcaseCaseMapping[cases[i].procedurestappen[0].procedurestap] = cases[i];
        keptCaseCount++;
      }
    } else {
      for (const subcase of cases[i].procedurestappen) {
        if (subcaseCaseMapping[subcase.procedurestap]) {
          // we already have a case & decision flow for this one. Mark this triple for removal
          toRemove.push({ ...cases[i], procedurestappen: [subcase] });
        } else {
          // we need to create a new case & decision flow for this one
          subcaseCaseMapping[subcase.procedurestap] = {
            procedurestappen: [subcase]
          };
          newCaseCount++;
        }
      }
    }
  }
  console.log(doubleSubcaseCount + ' double subcases');
  console.log(pubCount + ' with publication(s)');
  console.log(noPubCount + ' without publication(s)');
  let maxCount = 0;
  for (const subcaseUrl in subcaseCaseMapping) {
    if (subcaseCaseMapping.hasOwnProperty(subcaseUrl)) {
      if (subcaseCaseMapping[subcaseUrl].procedurestappen.length > maxCount) {
        maxCount = subcaseCaseMapping[subcaseUrl].procedurestappen.length;
      }
    }
  }
  console.log(Object.keys(subcaseCaseMapping).length + ' dossiers in totaal gehouden.');
  console.log(keptCaseCount + ' hiervan zijn behouden.');
  console.log(newCaseCount + ' hiervan zijn nieuw.');
  console.log('Maximum ' + maxCount + ' procedurestappen per nieuw dossier.');
  return subcaseCaseMapping;
}

/* Route to test the getSingleSubcaseCases function */
router.get('/mixdossiers-fix-1-dossier-per-procedurestap', async function(req, res) {
  try {
    let cases = await getSingleSubcaseCases(req.query.limit);
    const name = req.path.replace('/', '');
    console.log(`GET /${name}: ${Object.keys(cases).length} results`);
    res.send(cases);
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
