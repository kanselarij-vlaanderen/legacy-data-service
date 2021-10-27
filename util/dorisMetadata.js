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

  lookup: function (id) {
    if (dorisRecords[id]) {
      return dorisRecords[id];
    }
  }
};

// run the DORIS import
console.log('WARNING: importing DORIS metadata. Please hold off on querying until this is finished...');
dorisMetadata.importCSVtoJSON();

export default dorisMetadata;
