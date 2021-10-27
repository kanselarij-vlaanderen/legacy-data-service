const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
import { getSimilarity, getWeightedScore } from '../util/similarity';
const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

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
  let possibleMatches = [];
  let regeringen = kaleidosData.getRegeringen();
  let agendapuntDatum = agendapunt.geplandeStart || agendapunt.agendaAanmaakdatum || agendapunt.agendaPuntAanmaakdatum;
  let lookupDate = new Date(agendapuntDatum);
  if (regeringen && agendapunt && agendapunt.dorisRecord) {
    for (const mandataris of regeringen) {
      let themisMandataris = { ...mandataris };
      themisMandataris.scores = {};
      themisMandataris.startDate = new Date(themisMandataris.mandaatStart).getTime();
      themisMandataris.endDate = new Date(themisMandataris.mandaatEinde).getTime();
      if (!lookupDate || (lookupDate >= themisMandataris.startDate && (!themisMandataris.endDate || lookupDate <= themisMandataris.endDate))) {
        // themisMandataris.distances = {};
        // compare dar_indiener, dar_indiener_samenvatting, and dar_titel_indiener
        if (agendapunt.dorisRecord.dar_indiener) {
          let similarity = getSimilarity(agendapunt.dorisRecord.dar_indiener, themisMandataris.normalizedName, 'name');
          themisMandataris.scores.dar_indiener = similarity;
        }
        if (agendapunt.dorisRecord.dar_indiener_samenvatting) {
          let similarity = getSimilarity(agendapunt.dorisRecord.dar_indiener_samenvatting, themisMandataris.normalizedName + ' ' + themisMandataris.normalizedTitel, 'both');
          themisMandataris.scores.dar_indiener_samenvatting = similarity;
        }
        if (agendapunt.dorisRecord.dar_titel_indiener) {
          let similarity = getSimilarity(agendapunt.dorisRecord.dar_titel_indiener, themisMandataris.normalizedTitel, 'title');
          themisMandataris.scores.dar_titel_indiener = similarity;
        }
        // Some properties are required to have at least some similarity, such as the name or familyName. Otherwise we get nonsense matches based on title or first name alone.
        // However, if for example only the title is set and it has a good score, we can include the match, as this likely means there was no name set in Kaleidos.
        // Similarly, if only the name/familyName match, but the title match is low, it could mean there's just not much difference in the name, such as 'Coens' and 'Geens', which only have a string distance of 2.
        themisMandataris.score = getWeightedScore(themisMandataris.scores);
        // TODO: find optimal threshold
        if (themisMandataris.score > 0.5) {
          possibleMatches.push(themisMandataris);
        }
      }
    }
  }
  if (possibleMatches.length > 0) {
    // now we need to rank the results and return the best one.
    possibleMatches.sort((a, b) => {
      return b.score - a.score;
    });
    return possibleMatches[0];
  } else {
    return undefined;
  }
};

/* Oplijsten alle mededelingen zonder indienende minister mét overeenkomstige record in DORIS */
router.get('/mededelingen-zonder-minister-met-DORIS', async function(req, res) {
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
      await caching.writeLocalFile(name, results);
    }
    let filteredResults = [];
    let unmatchedResults = [];
    let multipleResults = [];
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
          if (dar_indiener || dar_titel_indiener || dar_indiener_samenvatting) {
            result.bestMatch = findMandatary(result);
            if (result.bestMatch) {
              filteredResults.push(result);
            }
          } else {
            noMandataryResults.push(result);
          }
        } else {
          unmatchedResults.push(dorisId);
        }
      }
    }
    console.log(`${unmatchedResults.length} Results had no DORIS match`);
    console.log(`${noMandataryResults.length} Results had no information about the mandatary specified in DORIS`);
    console.log(`${multipleResults.length} Results had more than one DORIS match (with a non-identical mandatary)`);
    console.log(`GET /${name}: ${filteredResults.length} results`);
    if (req.query && req.query.csv) {
      sendCSV(filteredResults, req, res, `${name}.csv`);
    } else {
      res.send(filteredResults);
    }
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

export default router;
