import { promises as fsp } from 'fs';
import * as path from 'path';
export default {
  getQueryFromFile: async function (queryPath) {
   let filePath = path.resolve(queryPath);
   let results = [];
   try {
     let localFile = await fsp.readFile(filePath, 'utf8');
     return localFile;
   } catch (e) {
     console.log(e);
   }
   return results;
 }
};
