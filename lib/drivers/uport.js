const resolver = require('did-resolver').default
require('uport-did-resolver').default()

async function resolve(did) {
  return resolver(did.reference)
}

module.exports = {
  resolve
}
