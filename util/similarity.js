import { distance } from 'fastest-levenshtein';

// weighting used for all similarities in the final ranking of candidate matches. Total must equal 1
const SIMILARITY_WEIGHTS = {
  dar_indiener: 0.3,
  dar_indiener_samenvatting: 0.3,
  dar_titel_indiener: 0.4
};

// normalize a string/name by converting to lower case, removing double spaces, 'de', 'van', and padding hyphens,
// as well as 'special' normalizations for specific types, such as names and titles
const normalizeString = function (string, type) {
  if (!string) {
    return '';
  }
  let normalizedString = '' + string.toLowerCase().trim();
  if (type === 'name' || type === 'both') {
    // removing composed family name parts that will give false matches if left in. (e.g. 'De Ryck - De Croo')
    normalizedString = normalizedString.replace(/\./i, '');
    normalizedString = normalizedString.replace(/è/i, 'e');
    normalizedString = normalizedString.replace(/é/i, 'e');
    normalizedString = normalizedString.replace(/^van den[\s]+/i, '');
    normalizedString = normalizedString.replace(/^van de[\s]+/i, '');
    normalizedString = normalizedString.replace(/^de[\s]+/i, '');
    normalizedString = normalizedString.replace(/ van den[\s]+/i, ' ');
    normalizedString = normalizedString.replace(/ van de[\s]+/i, ' ');
    normalizedString = normalizedString.replace(/ de[\s]+/i, ' ');
    normalizedString = normalizedString.replace(/- minister-president/, ''); //at least one Kaleidos mandatary actually had this in the name
    normalizedString = normalizedString.replace(/schitlz/, 'schiltz'); //an outlier that falls just below the threshold because of this type, easier to correct it this way than adjusting the similarity measure
  }
  if (type === 'title' || type === 'both') {
    // normalizing common patterns such as 'vlaams minister' to 'vm'
    normalizedString = normalizedString.replace(/vlaams minister/i, 'vm');
    normalizedString = normalizedString.replace(/gemeenschapsminister/i, 'gm');
    normalizedString = normalizedString.replace(/pesident/i, 'president');
    normalizedString = normalizedString.replace(/voozitter/i, 'voorzitter'); // yes, these all occur
    normalizedString = normalizedString.replace(/voorzitte$/i, 'voorzitter');
    normalizedString = normalizedString.replace(/voorzittter/i, 'voorzitter');
    normalizedString = normalizedString.replace(/voorzttter/i, 'voorzitter');
    normalizedString = normalizedString.replace(/ van /i, ' ');
  }
  return normalizedString.replace(/\s+/g, ' ').replace(/([^\s]+)-([^\s]+)/g, '$1 - $2').trim();
};

const getDistance = function (a, b, type) {
  let normalizedA = normalizeString(a, type);
  let normalizedB = normalizeString(b, type);
  return distance(normalizedA, normalizedB);
};

// calculates similarity between two strings based on their edit distance
const getSimilarity = function (a, b, type) {
  let normalizedA = normalizeString(a, type);
  let normalizedB = normalizeString(b, type);
  if (!a || !b) {
    return 0;
  }
  let d = distance(normalizedA, normalizedB);
  let maxDistance = Math.max(normalizedA.length, normalizedB.length);
  // this way, a distance of 0 gets similarity 1, where a distance equal to the length of the longest string (= max levenshtein distance) gets a similarity of 0
  let similarity = 1.0 * (maxDistance - d) / (maxDistance + d);
  return similarity;
};

// used to rank candidate matches
const getWeightedScore = function (scores) {
  let score = 0;
  for (const key in SIMILARITY_WEIGHTS) {
    if (SIMILARITY_WEIGHTS.hasOwnProperty(key)) {
      if (scores.hasOwnProperty(key)) {
        score += SIMILARITY_WEIGHTS[key] * scores[key];
      }
      // when not scored, assign 0
    }
  }
  return score;
};

export { SIMILARITY_WEIGHTS, getSimilarity, getWeightedScore, normalizeString, getDistance };
