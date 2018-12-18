const { EventEmitter } = require('events')
const { Identity } = require('./identity')
const { Channel } = require('./channel')
const { unpack } = require('ara-network/keys')
const { Server } = require('./http')
const { Cache } = require('./cache')
const Batch = require('batch')
const util = require('./util')
const pify = require('pify')

const STARTING = 1
const STARTED = 2
const STALLED = 3
const READY = 4 | STARTED
const BUSY = STARTING | STARTED

const $status = Symbol('status')

/**
 * Helper to rebind a once time use "ready" function
 * to the resolver instance
 * @private
 * @param {Resolver}
 */
function ready(resolver) {
  resolver.ready = util.readyify(Resolver.prototype.ready.bind(resolver))
}

/**
 * The Resolver class represents a DID universal
 * resolver tha implements DID methods.
 * @public
 * @class Resolver
 * @extends EventEmitter
 */
class Resolver extends EventEmitter {
  /**
   * STALLED status constant.
   * @public
   * @static
   * @accessor
   * @type {Number}
   */
  static get STALLED() { return STALLED }

  /**
   * STARTING status constant.
   * @public
   * @static
   * @accessor
   * @type {Number}
   */
  static get STARTING() { return STARTING }

  /**
   * STARTED status constant.
   * @public
   * @static
   * @accessor
   * @type {Number}
   */
  static get STARTED() { return STARTED }

  /**
   * READY status constant.
   * @public
   * @static
   * @accessor
   * @type {Number}
   */
  static get READY() { return READY }

  /**
   * BUSY status constant.
   * @public
   * @static
   * @accessor
   * @type {Number}
   */
  static get BUSY() { return BUSY }

  /**
   * Resolver class constructor.
   * @public
   * @constructor
   * @param {Object} conf
   */
  constructor(conf) {
    super().setMaxListeners(0)

    this.conf = conf
    this[$status] = 0

    ready(this)
  }

  /**
   * Current resolver status. Use a bit mask to determine
   * which status is currently set.
   * @public
   * @accessor
   * @type {Number}
   */
  get status() {
    return this[$status]
  }

  /**
   * Waits for all resources to be ready.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits ready
   */
  async ready(cb) {
    return pify(async (done) => {
      const callback = util.callback(cb, done)

      if (STARTED !== this[$status]) {
        callback(new Error('resolver not started.'))
        return
      }

      if (READY !== (this[$status] & READY)) {
        try {
          await this.identity.ready()
          await this.channel.ready()
          await this.server.ready()
          await this.cache.ready()
        } catch (err) {
          callback(err)
          return
        }

        this[$status] = READY
        this.emit('ready')
      }

      callback(null)
    })()
  }

  /**
   * Starts the resolver and waits for everything to be ready.
   * @public
   * @param {?(Function)} cb
   * @return {Promise<Boolean>}
   * @emits start
   */
  async start(cb) {
    return pify(async (done) => {
      const callback = util.callback(cb, done)
      const { conf } = this

      if (BUSY === (this[$status] & BUSY)) {
        callback(null, false)
        return
      }

      this[$status] |= STARTING

      this.identity = new Identity(conf)
      this.channel = new Channel(this, conf)
      this.server = new Server(this, conf)
      this.cache = new Cache(this, conf)

      const events = [ 'error' ]

      util.forwardEvents(this.identity, this, events)
      util.forwardEvents(this.server, this, events)
      util.forwardEvents(this.cache, this, events)

      this[$status] = STARTED

      await this.ready()

      if (STALLED === (this[$status] & STALLED)) {
        callback(new Error('resolver stalled while waiting to be ready.'))
        return
      }

      const { discoveryKey } = unpack({
        buffer: await this.identity.keyring.get(conf.network)
      })

      await this.server.listen(conf.port)

      if (STALLED === (this[$status] & STALLED)) {
        callback(new Error('resolver stalled while starting server.'))
        return
      }

      const adds = conf.get('cache-nodes').map(id => this.cache.addPeer(id))
      await Promise.all(adds)

      if (STALLED === (this[$status] & STALLED)) {
        callback(new Error('resolver stalled while adding peers.'))
        return
      }

      process.nextTick(() => {
        if (STALLED === this[$status] & STALLED) {
          callback(new Error('resolver stalled while adding peers.'))
          return
        }

        this.channel.announce(discoveryKey)
        process.nextTick(callback, null, true)
        process.nextTick(() => this.emit('start'))
      })
    })()
  }

  /**
   * Stops the resolver and everything else that was started
   * @public
   * @param {?(Function)} cb
   * @return {Promise<Boolean>}
   * @emits start
   */
  async stop(cb) {
    return pify(async (done) => {
      const callback = util.callback(cb, done)

      if (STARTED !== this[$status] & STARTED) {
        callback(new Error('resolver is not started.'))
        return
      }

      this.ready = util.readyify(this.ready.bind(this))
    })()
  }

  /**
   * An alias to `resolver.destroy()`.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  close(cb) {
    return this.destroy(cb)
  }

  /**
   * Destroy identity resolver resolver and underlying resources.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  destroy(cb) {
    const ondestroy = util.callback(cb)
    const batch = new Batch()
    const resolver = this

    batch.push(done => this.server.destroy(done))
    batch.push(done => this.cache.destroy(done))

    return pify((done) => {
      batch.end(onend)

      function onend(err) {
        done(err)
        if (err) {
          ondestroy(err)
        } else {
          resolver.emit('close')
        }
      }
    })()
  }
}

module.exports = {
  Resolver
}
