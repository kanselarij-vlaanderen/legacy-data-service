const express = require('express');
const router = express.Router();
import kaleidosData from '../util/kaleidosData';
import caching from '../util/caching';
import queries from '../util/queries';
import dorisMetadata from '../util/dorisMetadata';
const SPARQL_EXPORT_FOLDER = process.env.SPARQL_EXPORT_FOLDER || '/data/legacy/';

// const BASE_URL = 'https://kaleidos-test.vlaanderen.be';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

/* Alle themis-conforme regeringen */
router.get('/regeringen', async function(req, res) {
  const name = req.path.replace('/', '');
  if (req.query && req.query.csv) {
    csv.sendCSV(kaleidosData.getRegeringen(), req, res, `${name}.csv`);
  } else {
    res.send(kaleidosData.getRegeringen());
  }
});

/* Alle mandatarissen die niet in een regering zitten */
router.get('/mandatarissen-niet-in-regering', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/mandatarissen-niet-in-regering.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
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

/* Alle agendapunten gelinkt aan mandatarissen die niet in een regering zitten */
router.get('/agendapunten-met-mandatarissen-niet-in-regering', async function(req, res) {
  const name = req.path.replace('/', '');
  const query = await queries.getQueryFromFile('/app/queries/agendapunten-met-mandatarissen-niet-in-regering.sparql');
  try {
    let results = await caching.getLocalJSONFile(name);
    if (!results) {
      results = await kaleidosData.executeQuery(query, req.query.limit);
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
export default router;
