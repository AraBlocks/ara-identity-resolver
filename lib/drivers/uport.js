const { DIDDocument } = require('did-document')
const resolver = require('did-resolver').default
require('uport-did-resolver').default()

async function resolve(did) {
  const ddo = await new DIDDocument(resolver(did.reference))
  return ddo
}

module.exports = {
  resolve
}
