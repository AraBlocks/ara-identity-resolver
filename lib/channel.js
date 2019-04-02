const { createChannel } = require('ara-network/discovery')
const { EventEmitter } = require('events')
const thunky = require('thunky')
const Batch = require('batch')
const util = require('./util')
const pify = require('pify')

/**
 * The Channel class represents a discovery channel for
 * a Resolver instance.
 * @public
 * @class Channel
 * @extends EventEmitter
 */
class Channel extends EventEmitter {
  /**
   * Channel class constructor
   * @public
   * @constructor
   * @param {Resolver} resolver
   * @param {Object} opts
   */
  constructor(resolver, opts) {
    if (!resolver || 'object' !== typeof resolver) {
      throw new TypeError('Expecting resolver to be an object.')
    }

    if (!opts || 'object' !== typeof opts) {
      throw new TypeError('Expecting options to be an object.')
    }

    super().setMaxListeners(0)

    this.resolver = resolver
    this.ready = thunky(this.ready.bind(this))
    this.channel = createChannel(opts)
  }

  /**
   * Announces to the channel that this resolver is
   * available on the server port it is listening to.
   * @public
   * @param {String|Buffer} discoveryKey
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits announce
   */
  async announce(discoveryKey, cb) {
    return pify((done) => {
      const { port } = this.resolver.server.address()
      const callback = util.callback(cb, done)
      this.channel.join(discoveryKey, port, callback)
      this.emit('announce', discoveryKey, port)
    })()
  }

  /**
   * Waits for 'whoami' discovery to be considered ready.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits ready
   */
  async ready(cb) {
    const batch = new Batch()
    batch.push((done) => {
      if (this.channel.me) {
        done(null)
      } else {
        this.once('whoami', done)
      }
    })

    batch.push((done) => {
      this.emit('ready')
      done()
    })

    return pify(done => batch.end(util.callback(cb, done)))()
  }

  /**
   * Closes channel. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async destroy(cb) {
    return pify(done => this.channel.close(util.callback(cb, done)))()
  }
}

module.exports = {
  Channel
}
