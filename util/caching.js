import { promises as fsp } from 'fs';
import * as path from 'path';

const JSON_EXPORT_FOLDER = process.env.JSON_EXPORT_FOLDER || '/data/legacy/';
const BYPASS_CACHE = process.env.BYPASS_CACHE || false;
export default {
  getLocalJSONFile: async function (name) {
    // bypass the cache
    if (BYPASS_CACHE) {
      return null;
    }
    let localFile;
    let filePath = path.resolve(JSON_EXPORT_FOLDER + '/' + name + '.json');
    try {
      localFile = await fsp.readFile(filePath);
    } catch (e) {
      console.log('No local file found at ' + filePath);
      return null;
    }
    if (localFile) {
      console.log('Local file found at ' + filePath);
      return JSON.parse(localFile);
    } else {
      return null;
    }
  },
  writeLocalFile: async function (name, data) {
    let filePath = path.resolve(JSON_EXPORT_FOLDER + '/' + name + '.json');
    await fsp.writeFile(filePath, JSON.stringify(data));
    console.log('Local file written to ' + filePath);
  }
};
