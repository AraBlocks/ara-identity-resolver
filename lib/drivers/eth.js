const { DIDDocument } = require('did-document')
const resolver = require('did-resolver').default
require('eth-did-resolver')()

async function resolve(did) {
  const json = await resolver(did.reference)
  const ddo = new DIDDocument(json)
  return ddo
}

module.exports = {
  resolve
}
