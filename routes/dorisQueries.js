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

router.get('/doris-record/:dorisId', async function (req, res) {
  if (req.params && req.params.dorisId) {
    res.json(dorisMetadata.lookup(req.params.dorisId));
  }
});
router.get('/doris-record-for-resource', async function (req, res) {
  if (req.params && req.query.resource) {
    let dorisIds = await kaleidosData.getDorisIds(req.query.resource);
    let dorisRecords = [];
    for (const id of dorisIds) {
      dorisRecords.push(dorisMetadata.lookup(id));
    }
    res.json(dorisRecords);
  }
});

/* Oplijsten alle mededelingen zonder indienende minister */
router.get('/mededelingen-zonder-minister', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/mededelingen_zonder_minister.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        const agendaPuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendaPuntId}`;
      }
      console.log(`GET /${name}: ${results.length} results`);
      await caching.writeLocalFile(name, results);
    }
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

/* Match a dorisRecord with mandataries in de kaleidosData governments. */
const findMandatary = function (agendapunt) {
  let matches = [];
  let matchesNeeded = 1;
  let regeringen = kaleidosData.getRegeringen();
  let agendapuntDatum = agendapunt.geplandeStart || agendapunt.agendaAanmaakdatum || agendapunt.agendaPuntAanmaakdatum;
  let lookupDate = new Date(agendapuntDatum);
  //TODO: sometimes indieners can be double. We also need to make sure that once a minister is matched, it's removed from the search set.
  if (regeringen && agendapunt && agendapunt.dorisRecord) {
    //it's also possible that multiple mandataries are in DORIS, separated by ';', or that one of the names/titles just has ';' in it... So we need to check all of them
    let indienerMatchesNeeded = 1, samenvattingMatchesNeeded = 1, titelMatchesNeeded = 1;
    if (agendapunt.dorisRecord.dar_indiener) {
      let indieners = agendapunt.dorisRecord.dar_indiener.split(';').filter((item) => { return item.length > 0 }); // just to make sure no weirdness happens with strings that end on ';', for example
      if (indieners.length > indienerMatchesNeeded) {
        indienerMatchesNeeded = indieners.length;
      }
    }
    if (agendapunt.dorisRecord.dar_indiener_samenvatting) {
      let indiener_samenvattingen = agendapunt.dorisRecord.dar_indiener_samenvatting.split(';').filter((item) => { return item.length > 0 });
      if (indiener_samenvattingen.length > samenvattingMatchesNeeded) {
        samenvattingMatchesNeeded = indiener_samenvattingen.length;
      }
    } else {
      samenvattingMatchesNeeded = indienerMatchesNeeded;
    }
    if (agendapunt.dorisRecord.dar_titel_indiener) {
      let indiener_titels = agendapunt.dorisRecord.dar_titel_indiener.split(';').filter((item) => { return item.length > 0 });
      if (indiener_titels.length > titelMatchesNeeded) {
        titelMatchesNeeded = indiener_titels.length;
      }
    } else {
      titelMatchesNeeded = Math.max(indienerMatchesNeeded, samenvattingMatchesNeeded);
    }
    // if any of the matches is not split up, it means this just had ';' in it for another reason
    matchesNeeded = Math.min(indienerMatchesNeeded, samenvattingMatchesNeeded, titelMatchesNeeded);
    let indieners = [], samenvattingen = [], titels = [];
    if (matchesNeeded > 1) {
      if (agendapunt.dorisRecord.dar_indiener) {
        indieners = agendapunt.dorisRecord.dar_indiener.split(';').filter((item) => { return item.length > 0 }); // just to make sure no weirdness happens with strings that end on ';', for example
      }
      if (agendapunt.dorisRecord.dar_indiener_samenvatting) {
        samenvattingen = agendapunt.dorisRecord.dar_indiener_samenvatting.split(';').filter((item) => { return item.length > 0 });
      }
      if (agendapunt.dorisRecord.dar_titel_indiener) {
        titels = agendapunt.dorisRecord.dar_titel_indiener.split(';').filter((item) => { return item.length > 0 });
      }
      // check if they're all the same length
      if ((indieners.length && samenvattingen.length && indieners.length !== samenvattingen.length) ||
        (indieners.length && titels.length && indieners.length !== titels.length) ||
        (samenvattingen.length && titels.length && samenvattingen.length !== titels.length)) {
        console.error(`ERROR: indiener metadata lengths not the same for ${agendapunt.dorisId}`);
        console.log(`indieners (${indieners.length}): ${agendapunt.dorisRecord.dar_indiener}`);
        console.log(`samenvattingen (${samenvattingen.length}): ${agendapunt.dorisRecord.dar_indiener_samenvatting}`);
        console.log(`titels (${titels.length}): ${agendapunt.dorisRecord.dar_titel_indiener}`);
      }
    } else {
      // handle edge cases where two VM's are concatenated in DORIS
      // e.g., "dar_titel_indiener": "VM Financien, Begroting en Gezondheidsbeleid, VM Buitenlands Beleid,   Europese Aangelegenheden, Wetenschap en Technologie, mini",
      // e.g., "dar_titel_indiener": "Minister-president, VM Onderwijs en Ambtenarenzaken"
      let edgeCaseMatches = agendapunt.dorisRecord.dar_titel_indiener.split('VM ').filter((item) => { return item.length > 0; });
      if (agendapunt.dorisRecord.dar_titel_indiener && edgeCaseMatches && edgeCaseMatches.length > 1) {
        matchesNeeded = edgeCaseMatches.length;
        // console.log(`MATCH edge case: ${agendapunt.dorisRecord.dar_titel_indiener}`);
        if (agendapunt.dorisRecord.dar_indiener) {
          indieners = agendapunt.dorisRecord.dar_indiener.split(', ').filter((item) => { return item.length > 0 }).slice(0, matchesNeeded);
        }
        if (agendapunt.dorisRecord.dar_titel_indiener) {
          titels = agendapunt.dorisRecord.dar_titel_indiener.split('VM ').filter((item) => { return item.length > 0 }).map((item) => { return 'VM ' + item; });
        }
        if (agendapunt.dorisRecord.dar_indiener_samenvatting) {
          // it's too hard splitting out the real string in this edge case. Just concatenate the indiener and title
          samenvattingen = [];
          for (let i = 0; i < matchesNeeded; i++) {
            samenvattingen.push(`${indieners[i]} - ${titels[i]}`);
            // console.log(`${indieners[i]} - ${titels[i]}`);
          }
        }
        // console.log('----');
      } else {
        if (agendapunt.dorisRecord.dar_indiener) {
          indieners = [agendapunt.dorisRecord.dar_indiener];
        }
        if (agendapunt.dorisRecord.dar_indiener_samenvatting) {
          samenvattingen = [agendapunt.dorisRecord.dar_indiener_samenvatting];
        }
        if (agendapunt.dorisRecord.dar_titel_indiener) {
          titels = [agendapunt.dorisRecord.dar_titel_indiener];
        }
      }
    }

    for (let i = 0; i < matchesNeeded; i++) {
      let possibleMatches = [];
      for (const mandataris of regeringen) {
        let themisMandataris = { ...mandataris };
        themisMandataris.scores = {};
        themisMandataris.startDate = new Date(themisMandataris.mandaatStart).getTime();
        themisMandataris.endDate = new Date(themisMandataris.mandaatEinde).getTime();
        if (!lookupDate || (lookupDate >= themisMandataris.startDate && (!themisMandataris.endDate || lookupDate <= themisMandataris.endDate))) {
          // compare dar_indiener, dar_indiener_samenvatting, and dar_titel_indiener
          if (indieners[i]) {
            let similarity = Math.max(
              getSimilarity(indieners[i], themisMandataris.normalizedName, 'name'),
              getSimilarity(indieners[i], themisMandataris.normalizedReversedName, 'name')
            );
            if (!themisMandataris.scores.dar_indiener || similarity > themisMandataris.scores.dar_indiener) {
              themisMandataris.scores.dar_indiener = similarity;
            }
          }
          if (samenvattingen[i]) {
            let similarity = Math.max(
              getSimilarity(samenvattingen[i], themisMandataris.normalizedName + ' ' + themisMandataris.normalizedTitel, 'both'),
              getSimilarity(samenvattingen[i], themisMandataris.normalizedReversedName + ' ' + themisMandataris.normalizedTitel, 'both')
            );
            if (!themisMandataris.scores.dar_indiener_samenvatting || similarity > themisMandataris.scores.dar_indiener_samenvatting) {
              themisMandataris.scores.dar_indiener_samenvatting = similarity;
            }
          }
          if (titels[i]) {
            let similarity = getSimilarity(titels[i], themisMandataris.normalizedTitel, 'title');
            if (!themisMandataris.scores.dar_titel_indiener || similarity > themisMandataris.scores.dar_titel_indiener) {
              themisMandataris.scores.dar_titel_indiener = similarity;
            }
          }
          themisMandataris.score = getWeightedScore(themisMandataris.scores);
          // TODO: find optimal threshold
          if (themisMandataris.score > 0.21) { // this threshold was carefully selected to exclude wrong results! Modify at your own risk!
            possibleMatches.push(themisMandataris);
          }
        }
      }
      if (possibleMatches.length > 0) {
        // now we need to rank the results and select the best one.
        possibleMatches.sort((a, b) => {
          return b.score - a.score;
        });
        matches.push(possibleMatches[0]);
      }
    }
  }
  return matches;
};

let dorisMatches = []
const getDORISMatches = async function () {
  console.log('Matching DORIS metadata...');
  const name = 'mededelingen-zonder-minister-met-DORIS';
  const query = await queries.getQueryFromFile('/app/queries/mededelingen_zonder_minister.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query);
      // generate urls
      for (const result of results) {
        const meetingId = result.meeting.substring(result.meeting.lastIndexOf('/') + 1);
        const agendaId = result.agenda.substring(result.agenda.lastIndexOf('/') + 1);
        const agendaPuntId = result.agendapunt.substring(result.agendapunt.lastIndexOf('/') + 1);
        result.url = `${BASE_URL}/vergadering/${meetingId}/agenda/${agendaId}/agendapunten/${agendaPuntId}`;
      }
      await caching.writeLocalFile(name, results);
    }
    let filteredResults = [];
    let noDorisRecords = [];
    let multipleResults = [];
    let noMatchResults = [];
    let noMandataryResults = [];
    let count = 0;
    for (let result of results) {
      count++;
      if (count % 1000 === 0) {
        console.log(count + ' / ' + results.length);
      }
      if (result.source) {
        const dorisId = result.source.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '');
        result.dorisId = dorisId;
        let dorisRecords = dorisMetadata.lookup(dorisId);
        if (dorisRecords && dorisRecords.length) {
          // deze velden geven ons informatie over de bevoegde minister
          let { dar_indiener, dar_titel_indiener, dar_indiener_samenvatting } = dorisRecords[0];
          result.dorisRecord = dorisRecords[0];
          if (dorisRecords.length > 1) {
            // NOTE: 2 stuks manueel gecheckt waarvoor dit voorvalt.
            // Dit zijn versies van hetzelfde document/agendapunt en hebben dezelfde indiener. We kunnen dit dus negeren
            // voor de zekerheid toch dit mechanisme om te checken.
            for (let i = 1; i < dorisRecords.length; i++) {
              if (dorisRecords[i].dar_indiener !== dar_indiener || dorisRecords[i].dar_titel_indiener !== dar_titel_indiener || dorisRecords[i].dar_indiener_samenvatting !== dar_indiener_samenvatting) {
                multipleResults.push(result);
              }
            }
          }
          if (count < MAX_RESULTS && (dar_indiener || dar_titel_indiener || dar_indiener_samenvatting)) {
            result.matches = findMandatary(result);
            if (result.matches && result.matches.length > 0) {
              let minScore;
              for (const match of result.matches) {
                if (!minScore || match.score < minScore) {
                  minScore = match.score;
                }
              }
              result.minScore = minScore;
              filteredResults.push(result);
            } else {
              noMatchResults.push(result);
            }
          } else {
            noMandataryResults.push(result);
          }
        } else {
          noDorisRecords.push(dorisId);
        }
      }
    }
    // order the results with the lowest score first, for easy inspection of the quality of the matches
    filteredResults.sort((a, b) => {
      return a.minScore - b.minScore;
    });
    console.log(`In totaal zijn er ${noDorisRecords.length} mededelingen met ontbrekende mandataris.`);
    console.log(`- ${noMandataryResults.length} hiervan hebben ook geen informatie over de indiener in DORIS, en kunnen dus niet automatisch opgelost worden`);
    console.log(`- ${multipleResults.length} hiervan hadden meer dan overeenstemmend 1 DORIS document (met niet-identieke indiener)`);
    console.log(`- ${noMatchResults.length} hiervan kon het algoritme niet op basis van de informatie in DORIS matchen met een mandataris in Kaleidos`);
    console.log(`- ${filteredResults.length} hiervan konden wel gematcht worden met een mandataris in Kaleidos, met een voldoende hoge zekerheid om accuraat te zijn`);
    dorisMatches = filteredResults;
  } catch (e) {
    console.log(e);
  }
};

/* Oplijsten alle mededelingen zonder indienende minister mét overeenkomstige record in DORIS */
router.get('/mededelingen-zonder-minister-met-DORIS', async function(req, res) {
  const name = req.path.replace('/', '');
  if (dorisMatches.length === 0 || (req.query && req.query.force)) {
    await getDORISMatches();
  }
  console.log(`GET /${name}: ${dorisMatches.length} results`);
  let results = [];
  if (req.query && +req.query.limit) {
    results = dorisMatches.slice(0, +req.query.limit);
  } else {
    results = dorisMatches;
  }
  if (req.query && req.query.csv) {
    csv.sendCSV(results, req, res, `${name}.csv`);
  } else {
    res.send(results);
  }
});

export default router;
