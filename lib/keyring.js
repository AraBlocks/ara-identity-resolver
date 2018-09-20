const { keyRing } = require('ara-network/keys')

/**
 * Loads a keyring for an identifier at some specified
 * storage location.
 * @public
 * @param {String} identifier
 * @param {String|Function} storage
 * @param {Object} opts
 * @param {String|Buffer} opts.secret
 * @return {Promise<Keyring>}
 */
async function load(identifier, storage, opts) {
  const secret = Buffer.from(opts.secret)
  const keyring = keyRing(storage, { secret })
  await keyring.ready()
  return keyring
}

module.exports = {
  load
}
