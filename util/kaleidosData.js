import { getMandatarissen } from './mandatarissen';
import { query, sparqlEscapeUri } from 'mu';
import { parseSparqlResults } from './parseSparqlResults';

let kaleidosData = {};
// execute this on startup to speed things up
const populateData = async function () {
  let result = await getMandatarissen();
  if (result) {
    kaleidosData.publicMandatarissen = result.public;
    kaleidosData.kanselarijMandatarissen = result.kanselarij;
  }
};
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
  }
};
