const { DIDDocument } = require('did-document')
const resolver = require('github-did-resolver')

async function resolve(did) {
  const json = await resolver.resolve(did.reference)
  const ddo = new DIDDocument(json)
  return ddo
}

module.exports = {
  resolve
}
