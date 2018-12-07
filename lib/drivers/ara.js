const { Ed25519VerificationKey2018 } = require('ld-cryptosuite-registry')
const { createParser } = require('../json')
const { DIDDocument } = require('did-document')
const { DID } = require('did-uri')
const crypto = require('ara-crypto')
const debug = require('debug')('ara:identity:resolver:drivers:ara')
const aid = require('ara-identity')

const OWNER = 'owner'

/**
 * JSON parser self optimized for DDO JSON documents
 * @private
 */
const parse = createParser()

/**
 * Resolves an DID for the 'ara' method.
 * @public
 * @param {DID} did
 * @param {?(Request)} req
 * @param {?(Response)} res
 * @return {Promise<Object>}
 */
async function resolve(did, req) {
  try {
    const json = await aid.fs.readFile(did.identifier, 'ddo.json', {
      cache: false
    })

    const ddo = new DIDDocument(parse(json))

    if (ddo && ddo.proof) {
      if (!await verify(ddo)) {
        throw req.error = new Error('Document integrity failed verification.')
      }
    }

    return ddo
  } catch (err) {
    debug(err)
    return null
  }
}

/**
 * Verifies the integrity of a DDO.
 * @private
 * @param {DIDDocument} ddo
 * @return {Boolean}
 */
function verify(ddo) {
  const proof = ddo.proof()
  const owner = ddo.id
  const creator = new DID(proof.creator)

  if (!proof || !proof.type || !proof.signatureValue) {
    return false
  }

  if (OWNER !== creator.fragment) {
    return false
  }

  if (creator.did !== owner.did) {
    return false
  }

  if (Ed25519VerificationKey2018 !== proof.type) {
    return false
  }

  let publicKey = null
  for (const { id, publicKeyHex } of ddo.publicKey) {
    if (id && publicKeyHex) {
      const did = new DID(id)
      if (OWNER === did.fragment && did.did === owner.did) {
        publicKey = Buffer.from(publicKeyHex, 'hex')
      }
    }
  }

  if (!publicKey) {
    return false
  }

  const signature = Buffer.from(proof.signatureValue, 'hex')
  const digest = ddo.digest(crypto.blake2b)
  return crypto.ed25519.verify(signature, digest, publicKey)
}

module.exports = {
  resolve
}
