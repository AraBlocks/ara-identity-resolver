const resolver = require('did-resolver').default
require('https-did-resolver').default()

async function resolve(did) {
  return resolver(did.reference)
}

module.exports = {
  resolve
}
