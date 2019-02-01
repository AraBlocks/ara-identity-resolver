const resolver = require('did-resolver').default
require('eth-did-resolver')()

async function resolve(did) {
  return resolver(did.reference)
}

module.exports = {
  resolve
}
