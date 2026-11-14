// JSON-only engineering stand-in. Real installed YAML is checked separately.
exports.parseDocument = function (text) {
  let value
  try { value = JSON.parse(text) } catch { return { errors: [new Error(text)], warnings: [] } }
  return {
    errors: [], warnings: [], toJS: () => value,
    get: key => value?.[key],
    getIn: path => path.reduce((v, key) => v?.[key], value)
  }
}
