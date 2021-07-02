import { query, sparqlEscapeUri } from 'mu';
import { parseSparqlResults } from './parseSparqlResults';

/* Get all resources of type mandaat:Mandataris in a specified graph, along with some relevant properties */
const getMandatarissenInGraph = async function (graph, limit) {
  const listQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

  SELECT DISTINCT ?mandataris ?person ?name ?titel ?start ?einde ?rangorde ?firstName ?familyName WHERE {
    GRAPH ${sparqlEscapeUri(graph)} {
      ?mandataris  a mandaat:Mandataris .
      OPTIONAL { ?mandataris mandaat:isBestuurlijkeAliasVan ?person } .
      OPTIONAL { ?person foaf:name ?name } .
      OPTIONAL { ?person foaf:firstName ?firstName } .
      OPTIONAL { ?person foaf:familyName ?familyName } .
      OPTIONAL { ?mandataris mandaat:start ?start } .
      OPTIONAL { ?mandataris mandaat:einde ?einde } .
      OPTIONAL { ?mandataris mandaat:rangorde ?rangorde } .
      OPTIONAL { ?mandataris dcterms:title ?titel } .
    }
  } ${limit ? 'LIMIT ' + limit : ''}`;
  let response = await query(listQuery);
  let results = parseSparqlResults(response);
  // make data easier to look up using the mandataris uri
  let resultsObject = {};
  for (const result of results) {
    if (result.mandataris) {
      resultsObject[result.mandataris] = result;
    }
  }
  return resultsObject;
};

/* Returns an object with graph uris as keys, and the mandataries in that graph as an array */
const getMandatarissen = async function (limit) {
  // select the full list of persons who are also mandataries in Kaldeidos
  // there's two graphs in Kaleidos: public and kanselarij, and they contain a different number of mandataries.
  const publicResults = await getMandatarissenInGraph('http://mu.semte.ch/graphs/public', limit);
  console.log(`${Object.keys(publicResults).length} mandatarissen in public graph`);
  const kanselarijResults = await getMandatarissenInGraph('http://mu.semte.ch/graphs/organizations/kanselarij', limit);
  console.log(`${Object.keys(kanselarijResults).length} mandatarissen in kanselarij graph`);
  return { 'public': publicResults, 'kanselarij': kanselarijResults };
}

export {
  getMandatarissen
};
