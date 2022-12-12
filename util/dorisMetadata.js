const csv = require('csv-parser');
const fs = require('fs');
import * as path from 'path';

/* Module to import all DORIS CSV data, and put it into a JSON object, with the DORIS ids as keys, for easy lookup */

const DORIS_IMPORT_FOLDER = '/data/DorisMetadata/';
const DORIS_BULK = 'exportDoris_201903_BULK';
const DORIS_GAP = 'exportDoris_201909_GAP';
const DORIS_PATHS = [
  DORIS_IMPORT_FOLDER + DORIS_BULK + '/OC/dar_doris_oc_document_metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_BULK + '/OC/dar_doris_oc_fiche_metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_BULK + '/VR/dar_doris_vr_document_metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_BULK + '/VR/dar_doris_vr_fiche_metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_GAP + '/OC/dar_doris_oc_document/metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_GAP + '/OC/dar_doris_oc_fiche/metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_GAP + '/VR/dar_doris_vr_document/metadata.csv',
  DORIS_IMPORT_FOLDER + DORIS_GAP + '/VR/dar_doris_vr_fiche/metadata.csv'
];
const IGNORE_KEYS = ["dar_update","dar_err_date","dar_pub_date"];

const dorisRecords = {};

const dorisMetadata =  {
  importCSVtoJSON: function (jsonPath) {
    let done = 0;
    for (const filePath of DORIS_PATHS) {
      fs.createReadStream(path.resolve(filePath))
      .pipe(csv({ separator: ';' }))
      .on('data', (data) => {
        if (data.r_object_id) {
          // there can be multiple records with this id across the files.
          if (dorisRecords[data.r_object_id]) {
            dorisRecords[data.r_object_id].push(data);
          } else {
            dorisRecords[data.r_object_id] = [data];
          }
        } else {
          console.error(`** WARNING: No r_object_id for record in (${filePath})`); // this should not happen
          // console.log(data);
        }
      })
      .on('end', () => {
        done++;
        if (done === DORIS_PATHS.length) {
          console.log('Done. Imported ' + done + ' DORIS files, good for ' + Object.keys(dorisRecords).length + ' ids');
        }
      });
    }
  },

  lookup: function (id, includeDorisProps) {
    if (dorisRecords[id]) {
      if (dorisRecords[id].length > 1) {
        // there are a few dorisIds that return multiple results, but only "dar_update" and "dar_pub_date" seem to differ, which doesn't matter for this analysis
        let unequalKeys = [];
        for (let i = 0; i < dorisRecords[id].length; i++) {
          // check all keys for equality (it could be just a double)
          for (const key in dorisRecords[id][i]) {
            if (dorisRecords[id][i].hasOwnProperty(key) && (!includeDorisProps || includeDorisProps.indexOf(key) > -1)) {
              for (let j = 0; j < dorisRecords[id].length; j++) {
                if (unequalKeys.indexOf(key) === -1 && i !== j && dorisRecords[id][j][key] !== dorisRecords[id][i][key] && (dorisRecords[id][j][key] !== undefined || dorisRecords[id][i][key] !== undefined)) {
                  unequalKeys.push(key);
                }
              }
            }
          }
        }
        if (unequalKeys.filter((key) => { return IGNORE_KEYS.indexOf(key) === -1; }).length > 0) {
          console.log('WARNING: multiple doris records ' + ' (' + dorisRecords[id].length + ')' + ' for ' + id);
          console.log('unequal keys: ' + JSON.stringify(unequalKeys));
          for (const dorisRecord of dorisRecords[id]) {
            for (const key in dorisRecord) {
              if (dorisRecord.hasOwnProperty(key)) {
                // console.log('====');
                // console.log('---- ' + key + ' ' + dorisRecord[key]);
              }
            }
          }
        }
      }
      return dorisRecords[id][0];
    }
  },
  /* Used to compare DORIS-specific identifiers such as object_name and dar_vorige/dar_rel_docs.
  Returns true if id1 contains id2 (case-insensitive) or vice-versa
  OR if id1 and id2 both contain 'DOC', AND have matching year and identifier */
  compareIds: function (id1, id2) {
    const docRegex = /[A-Z][A-Z] ([0-9][0-9][0-9][0-9]).*DOC\.([0-9]?[0-9]?[0-9]?[0-9]?).*/;
    if (id1.indexOf('DOC') > -1 && id2.indexOf('DOC') > -1) {
      let doc1Ids = id1.match(docRegex);
      let doc2Ids = id2.match(docRegex);
      if (doc1Ids && doc2Ids && doc1Ids.length > 2 && doc1Ids.length === doc2Ids.length) {
        // the identifier could have an inconsistently used prefix 0 (e.g., 0472 vs 472), so we compare both the string values and numerical values
        if (doc1Ids[1] === doc2Ids[1] && (doc1Ids[2] === doc2Ids[2] || (!isNaN(doc1Ids[2]) && !isNaN(doc2Ids[2]) && +doc1Ids[2] === +doc2Ids[2]))) {
          return true;
        }
      }
    }
    return id1.toUpperCase().indexOf(id2.toUpperCase()) > -1 || id2.toUpperCase().indexOf(id1.toUpperCase()) > -1;
  },

  /* Returns an array of unique sourceIds that are normalized (BIS/TER and other suffixes removed).
    For example:
    sourceIdString "VR 2019 1101 DOC.0130;VR 2019 1705 DOC.0715/1BIS;VR 2019 1705 DOC.0715/2BIS;VR 2019 1705 DOC.0715/3"
    returns ["VR 2019 1101 DOC.0130","VR 2019 1705 DOC.0715"]
  */
  getSourceIds: function (sourceIdString) {
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
        if (id.toUpperCase().indexOf('TER') > -1) {
          return id.substring(0, id.toUpperCase().lastIndexOf('TER'));
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
    });
  }
};

// run the DORIS import
console.log('WARNING: importing DORIS metadata. Please hold off on querying until this is finished...');
dorisMetadata.importCSVtoJSON();

export default dorisMetadata;
