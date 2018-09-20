const { load: loadKeyring } = require('./keyring')
const { EventEmitter } = require('events')
const { createParser } = require('./json')
const { DID } = require('did-uri')
const thunky = require('thunky')
const crypto = require('ara-crypto')
const debug = require('debug')('ara:identity:resolver:identity')
const pify = require('pify')
const util = require('./util')
const aid = require('ara-identity')
const ss = require('ara-secret-storage')

const parseSecretStorage = createParser(ss.encrypt(
  crypto.randomBytes(2),
  {
    key: crypto.randomBytes(16),
    iv: crypto.randomBytes(16),
  }
))

/**
 * The Identity class represents an ARA identity and keyring
 * associated with the identity resolver network node.
 * @public
 * @class Identity
 * @extends EventEmitter
 */
class Identity extends EventEmitter {
  /**
   * @public
   * @param {Object} opts
   * @param {String|Buffer} opts.identifier
   * @param {String|Buffer} opts.password
   * @param {String|Buffer} opts.keyring
   * @param {String|Buffer} opts.secret
   * @return {Promise<Object>}
   */
  constructor(opts) {
    super().setMaxListeners(0)

    const did = new DID(opts.identifier)

    this.identifier = did.identifier
    this.publicKey = opts.publicKey || null
    this.secretKey = opts.secretKey || null
    this.password = crypto.blake2b(Buffer.from(opts.password))
    this.keyring = opts.keyring || null
    this.secret = opts.secret || null
    this.ready = thunky(this.ready.bind(this))
    this.did = did
  }

  /**
   * Waits for an identity and keyring based on an identifier, password, and
   * keyring path, and shared keyring secret.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async ready(cb) {
    const { keyring, secret } = this
    const { password, did } = this
    return pify(async (done) => {
      const callback = util.callback(cb, done)
      const keystore = parseSecretStorage(await aid.fs.readFile(
        did.identifier,
        'keystore/ara'
      ))

      this.publicKey = Buffer.from(did.identifier, 'hex')
      this.secretKey = ss.decrypt(keystore, { key: password.slice(0, 16) })

      try {
        this.keyring = await loadKeyring(did.identifier, keyring, { secret })
      } catch (err) {
        debug(err)
      }

      try {
        if (!this.keyring || 'string' === typeof this.keyring) {
          this.keyring = await loadKeyring(did.identifier, keyring, {
            secret: this.secretKey
          })
        }
      } catch (err) {
        debug(err)
        callback(err)
        return
      }

      callback(null)
      this.emit('ready')
    })()
  }
}

module.exports = {
  Identity
}
