const { Ed25519VerificationKey2018 } = require('ld-cryptosuite-registry')
const { createParser } = require('../json')
const { DIDDocument } = require('did-document')
const { DID } = require('did-uri')
const crypto = require('ara-crypto')
const debug = require('debug')('ara:identity:resolver:drivers:ara')
const aid = require('ara-identity')

const IDENTIFIER_LENGTH = 64
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
async function resolve(did, req, res, server) {
  let ddo = null

  if (did.identifier.length === IDENTIFIER_LENGTH) {
    try {
      const json = await aid.fs.readFile(did.identifier, 'ddo.json', {
        cache: false
      })

      ddo = new DIDDocument(parse(json))
    } catch (err) {
      debug(err)
    }
  }

  if (!ddo) {
    server.timeout(req, res)
    try {
      const resolution = await aid.resolve(did.identifier, {
        parse, cache: true
      })

      ddo = new DIDDocument(resolution)
    } catch (err) {
      debug(err)
    }
  }

  if (ddo && 'function' === typeof ddo.proof) {
    if (!await verify(ddo)) {
      throw req.error = new Error('Document integrity failed verification.')
    }
  }

  return ddo
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

  try {
    const signature = Buffer.from(proof.signatureValue, 'hex')
    const digest = ddo.digest(crypto.blake2b)

    if (crypto.ed25519.verify(signature, digest, publicKey)) {
      return true
    }
  } catch (err) {
    debug(err)
  }

  //
  // ATTEMPT LEGACY WITH just 'owner' property set by
  // remocing the 'controller' property and recomputing the digesr
  // signature and attempting verification _again_
  //
  for (let i = 0; i < ddo.publicKey.length; ++i) {
    const pk = ddo.publicKey[i].toJSON()
    delete pk.controller
    ddo.publicKey[i] = pk
  }

  try {
    const signature = Buffer.from(proof.signatureValue, 'hex')
    const digest = ddo.digest(crypto.blake2b)

    if (crypto.ed25519.verify(signature, digest, publicKey)) {
      return true
    }
  } catch (err) {
    debug(err)
  }

  return false
}

module.exports = {
  resolve
}
