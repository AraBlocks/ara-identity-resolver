const json = require('./json')

/**
 * The IdentifiersResponse class represents
 * a JSON formatted response for a DID identifier.
 * @public
 * @class IdentifiersResponse
 */
class IdentifiersResponse {
  /**
   * Creates an instance of IdentifiersResponse from JSON
   * or object input.
   * @public
   * @static
   * @param {String|Object} value
   * @return {IdentifiersResponse}
   */
  static fromJSON(value) {
    if ('string' === typeof value) {
      return new IdentifiersResponse(IdentifiersResponse.parse(value))
    }

    return new IdentifiersResponse(value)
  }

  /**
   * IdentifiersResponse class constructor.
   * @public
   * @constructor
   * @param {Object} opts
   */
  constructor(opts) {
    if (!opts) { opts = {} }
    this.didDocument = opts.ddo || opts.document || opts.didDocument || {}
    this.didReference = opts.did || opts.didReference || {}
    this.methodMetadata = opts.methodMetadata || {}
    this.resolverMetadata = opts.resolverMetadata || {}
  }
}

/**
 * Fast JSON parse
 */
IdentifiersResponse.parse = json.createParser(IdentifiersResponse)

module.exports = {
  IdentifiersResponse
}
