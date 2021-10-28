import * as path from 'path';
import { promises as fsp } from 'fs';

const CSV_EXPORT_FOLDER = process.env.CSV_EXPORT_FOLDER || '/data/legacy/';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

export default {
  generateCSV: function (headers, data) {
    let csvString = ``;
    // add the headers
    for (const header of headers) {
      csvString += `${header};`;
    }
    // remove the last semicolon
    csvString = csvString.replace(/undefined/g, '');
    csvString += `\n`;
    // add the data
    for (const item of data) {
      for (const header of headers) {
        if (item.hasOwnProperty(header)) {
          if (typeof item[header] === 'object') {
            csvString += `"${JSON.stringify(item[header])}";`;
          } else if (item[header] !== undefined && ('' + item[header]).indexOf('http') === 0) {
            csvString += `${item[header]};`;
          } else {
            if (item[header] !== undefined && ('' + item[header]).indexOf('"') > -1) {
              console.log('WARNING: data contains double quotes which were replaced by single quotes');
              item[header] = ('' + item[header]).replace(/"/g, '\'');
            }
            csvString += `"${item[header]}";`;
          }
        } else {
          csvString += ';';
        }
      }
      // remove the last semicolon
      csvString = csvString.substring(0, csvString.length - 1);
      csvString += `\n`;
    }
    csvString = csvString.replace(/undefined/g, '');
    return csvString;
  },

  sendCSV: async function (results, req, res, fileSuffix) {
    if (!fileSuffix) {
      fileSuffix = 'results.csv';
    }
    let csvString = '';
    if (results && results.length) {
      let headers = [];
      for (const key in results[0]) {
        if (results[0].hasOwnProperty(key)) {
          // make sure data urls are pushed to the last columns for clarity
          if (results[0][key] !== undefined && ('' + results[0][key]).indexOf('http') === 0 && ('' + results[0][key]).indexOf(BASE_URL) === -1) {
            headers.push(key);
          } else {
            headers.splice(0, 0, key);
          }
        }
      }
      csvString = this.generateCSV(headers, results);
    }
    await fsp.writeFile(path.resolve(CSV_EXPORT_FOLDER + fileSuffix), csvString);
    res.send('CSV generated at ' + path.resolve(CSV_EXPORT_FOLDER + fileSuffix));
  }
};
