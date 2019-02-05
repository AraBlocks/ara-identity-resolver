const { DIDDocument } = require('did-document')
const resolver = require('did-resolver').default
require('muport-did-resolver')()

async function resolve(did) {
  const ddo = await new DIDDocument(resolver(did.reference))
  return ddo
}

module.exports = {
  resolve
}
