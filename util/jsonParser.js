/* Helper function to get a subproperty using the json dot notation.
Helpful when the result from e.g., a webservice call is nested in multiple levels */

export default {
  getPropertyByPath: function (object, propertyPath) {
    const parts = propertyPath.split('.');
    let property = object;
    for (let i = 0; i < parts.length; i++) {
      if (property && property[parts[i]] !== undefined) {
        property = property[parts[i]];
      } else {
        property = undefined;
      }
    }
    return property;
  }
};
