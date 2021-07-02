/* Borrowed from https://github.com/kanselarij-vlaanderen/indieningsactiviteit-migration-service */
const parseSparqlResults = (data) => {
  if (!data) return;
  const vars = data.head.vars;
  return data.results.bindings.map((binding) => {
    const obj = {};
    vars.forEach((varKey) => {
      if (binding[varKey]) {
        obj[varKey] = binding[varKey].value;
      }
    });
    return obj;
  });
};

export {
  parseSparqlResults
};
