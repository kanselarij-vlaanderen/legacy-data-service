import { getMandatarissen, getGovernments } from './mandatarissen';
import { query, sparqlEscapeUri } from 'mu';
import { parseSparqlResults } from './parseSparqlResults';

let kaleidosData = {};
const KANSELARIJ_GRAPH = "http://mu.semte.ch/graphs/organizations/kanselarij";

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
    GRAPH <${KANSELARIJ_GRAPH}> {
      <${agendaUrl}> dct:hasPart ?agendapunt .
      ?agendapunt ext:wordtGetoondAlsMededeling "true"^^tl:boolean .
      ?agendapunt ext:prioriteit  ?prioriteit .
    }
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

  getProcedureStappenForDossier: async function (dossierUrl) {
    const getQuery = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>

  select DISTINCT ?procedurestap WHERE {
    GRAPH <${KANSELARIJ_GRAPH}> {
       <${dossierUrl}> dossier:Dossier.isNeerslagVan ?besluitvormingsaangelegenheid .
       ?besluitvormingsaangelegenheid dossier:doorloopt ?procedurestap .
     }
  }`;
    let results = await this.executeQuery(getQuery);
    return results;
  },

  getStukkenVoorAgendapunt: async function (agendapuntUrl) {
    const getQuery = `PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>

  select DISTINCT  ?stuk ?title WHERE {
    GRAPH <${KANSELARIJ_GRAPH}> {
      <${agendapuntUrl}> besluitvorming:geagendeerdStuk ?stuk .
      ?stuk dct:title ?title .
    }
  }`
    let results = await this.executeQuery(getQuery);
    return results;
  },

  getDorisIds: async function (resourceUrl) {
    const getQuery = `PREFIX dct: <http://purl.org/dc/terms/>

  select DISTINCT ?dorisId WHERE {
    GRAPH <${KANSELARIJ_GRAPH}> {
      <${resourceUrl}> dct:source ?dorisId .
    }
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
    let results = await this.executeQuery(getQuery);
    return results;
  },
  /* a generic function to get the first matching dct:title for a given subject URI, or an empty string if that doesn't exist*/
  getTitleForSubject: async function (subject) {
    const getQuery = `PREFIX dct: <http://purl.org/dc/terms/>
  select DISTINCT ?title WHERE {
    GRAPH <${KANSELARIJ_GRAPH}> {
      <${subject}> dct:title ?title .
    }
  }`;
    let results = await this.executeQuery(getQuery);
    return results && results.length ? results[0].title : '';
  },

  /* a generic function to get all properties for a given subject URI */
  getTriplesForSubject: async function (subject) {
    const getQuery = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>
  select DISTINCT ?predicate ?object WHERE {
    GRAPH <${KANSELARIJ_GRAPH}> {
      <${subject}> ?predicate ?object .
    }
  }`;
    let results = await this.executeQuery(getQuery);
    return results;
  },

  compareResources: async function (subject1, subject2) {
    let subject1Triples = await this.getTriplesForSubject(subject1);
    let subject2Triples = await this.getTriplesForSubject(subject2);
    let differentTriples = {};
    for (const subject1Triple of subject1Triples) {
      if (!differentTriples[subject1Triple.predicate]) {
        differentTriples[subject1Triple.predicate] = {};
        differentTriples[subject1Triple.predicate][subject2] = undefined;
      }
      differentTriples[subject1Triple.predicate][subject1] = subject1Triple.object;
    }
    for (const subject2Triple of subject2Triples) {
      if (!differentTriples[subject2Triple.predicate]) {
        differentTriples[subject2Triple.predicate] = {};
        differentTriples[subject2Triple.predicate][subject1] = undefined;
      }
      differentTriples[subject2Triple.predicate][subject2] = subject2Triple.object;
    }
    for (const predicate in differentTriples) {
      if (differentTriples.hasOwnProperty(predicate)) {
        if (differentTriples[predicate][subject2] === differentTriples[predicate][subject1]) {
          delete differentTriples[predicate];
        }
      }
    }
    return differentTriples;
  }
};
