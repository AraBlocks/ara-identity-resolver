const { EventEmitter } = require('events')
const { Identity } = require('./identity')
const { Channel } = require('./channel')
const { unpack } = require('ara-network/keys')
const { Server } = require('./http')
const { Cache } = require('./cache')
const Batch = require('batch')
const util = require('./util')
const pify = require('pify')

/**
 * The ResolverNetworkNode class represents a DID universal
 * resolver tha implements DID methods.
 * @public
 * @class ResolverNetworkNode
 * @extends EventEmitter
 */
class ResolverNetworkNode extends EventEmitter {
  /**
   * ResolverNetworkNode class constructor.
   * @public
   * @constructor
   * @param {Object} conf
   */
  constructor(conf) {
    super().setMaxListeners(0)

    this.conf = conf
    this.ready = util.readyify(this.ready.bind(this))
  }

  /**
   * Waits for all resources to be ready.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits ready
   */
  ready(cb) {
    return pify(async (done) => {
      const { conf } = this

      this.identity = new Identity(conf)
      this.channel = new Channel(this, conf)
      this.server = new Server(this, conf)
      this.cache = new Cache(this, conf)

      await this.identity.ready()
      await this.channel.ready()
      await this.server.ready()
      await this.cache.ready()

      const { discoveryKey } = unpack({
        buffer: await this.identity.keyring.get(conf.network)
      })

      await this.server.listen(conf.port)

      const events = [ 'error' ]

      util.forwardEvents(this.identity, this, events)
      util.forwardEvents(this.server, this, events)
      util.forwardEvents(this.cache, this, events)

      util.callback(cb, done)(null)

      process.nextTick(() => {
        this.emit('ready')
        this.channel.announce(discoveryKey)
      })
    })()
  }

  /**
   * An alias to `node.destroy()`.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  close(cb) {
    return this.destroy(cb)
  }

  /**
   * Destroy identity resolver node and underlying resources.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  destroy(cb) {
    const ondestroy = util.callback(cb)
    const batch = new Batch()
    const node = this

    batch.push(done => this.server.destroy(done))
    batch.push(done => this.cache.destroy(done))

    return pify((done) => {
      batch.end(onend)

      function onend(err) {
        done(err)
        if (err) {
          ondestroy(err)
        } else {
          node.emit('close')
        }
      }
    })()
  }
}

module.exports = {
  ResolverNetworkNode
}
