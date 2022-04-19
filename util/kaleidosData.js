import { getMandatarissen, getGovernments } from './mandatarissen';
import { query, sparqlEscapeUri } from 'mu';
import { parseSparqlResults } from './parseSparqlResults';

let kaleidosData = {};

const populateData = async function () {
  let result = await getMandatarissen();
  if (result) {
    kaleidosData.publicMandatarissen = result.public;
    kaleidosData.kanselarijMandatarissen = result.kanselarij;
  }
  let regeringen = await getGovernments();
  if (regeringen) {
    kaleidosData.regeringen = regeringen;
  }
  console.log('Done populating Kaleidos data.');
};

// execute this on startup to speed things up
populateData();

export default {
  populateData: populateData,
  executeQuery: async function (listQuery, limit) {
    let results = [];
    try {
      if (limit) {
        listQuery = listQuery + ` LIMIT ${limit}`;
      }
      let response = await query(listQuery);
      results = parseSparqlResults(response);
    } catch (e) {
      console.log(e);
    }
    return results;
  },
  getMandataris: function (mandatarisurl) {
    return {
      public: kaleidosData.publicMandatarissen[mandatarisurl],
      kanselarij: kaleidosData.kanselarijMandatarissen[mandatarisurl]
    };
  },

  getRegeringen: function () { return kaleidosData.regeringen; },

  getMededelingenForAgenda: async function (agendaUrl) {
    const getQuery = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>

  select DISTINCT ?agendapunt ?prioriteit WHERE {
   <${agendaUrl}> dct:hasPart ?agendapunt .
   ?agendapunt ext:wordtGetoondAlsMededeling "true"^^tl:boolean .
   ?agendapunt ext:prioriteit  ?prioriteit .
  } ORDER BY ?prioriteit`;
    let results = await this.executeQuery(getQuery);
    if (results && results.length) {
      // sort the results by priority number
      results.sort((a, b) => {
        if (+a.prioriteit > +b.prioriteit) {
          return 1;
        } else if (+a.prioriteit < +b.prioriteit) {
          return -1;
        }
        return 0;
      });
    }
    return results;
  },

  getStukkenVoorAgendapunt: async function (agendapuntUrl) {
    const getQuery = `PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>

  select DISTINCT  ?stuk ?title WHERE {
  <${agendapuntUrl}> besluitvorming:geagendeerdStuk ?stuk .
  ?stuk dct:title ?title .
  }`
    let results = await this.executeQuery(getQuery);
    return results;
  },

  getDorisIds: async function (resourceUrl) {
    const getQuery = `PREFIX dct: <http://purl.org/dc/terms/>

  select DISTINCT ?dorisId WHERE {
   <${resourceUrl}> dct:source ?dorisId .
  }`;
    let results = await this.executeQuery(getQuery);
    if (results && results.length > 0) {
      return results.map((result) => {
        return result.dorisId.replace('http://doris.vlaanderen.be/export/', '').replace('-pdf', '');
      });
    }
    return [];
  },

  /* Some triples for agendapoints occur in multiple graphs. Make sure any changes are applied to all of them */
  getGraphsForTriple: async function (triple) {
    const getQuery = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>
  select DISTINCT ?g WHERE {
    GRAPH ?g {
      ${triple}
    }
  }`;
    let results = await kaleidosData.executeQuery(getQuery);
    return results;
  }
};
