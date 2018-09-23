const { EventEmitter } = require('events')
const { createSwarm } = require('ara-network/discovery')
const { resolve } = require('path')
const { DID } = require('did-uri')
const hyperdb = require('hyperdb')
const crypto = require('ara-crypto')
const mutex = require('mutexify')
const Batch = require('batch')
const conf = require('../conf')
const pify = require('pify')
const util = require('./util')
const json = require('./json')

/**
 * The Cache class represents a key-value store
 * abstraction on top of hyperdb.
 * @class Cache
 * @extends EventEmitter
 */
class Cache extends EventEmitter {
  /**
   * Factory to create hyperdb instance based on an identifier.
   * @public
   * @static
   * @param {String} identifier
   * @param {Object} opts
   * @return {HyperDB}
   */
  static createDatabase(identifier, opts) {
    const { publicKey, secretKey } = opts
    const path = resolve(conf.get('cache-root'), identifier)
    return hyperdb(path, publicKey, {
      // dont store secretKey on disk
      storeSecretKey: false,
      // set to true to reduce the nodes array to the first node in it
      firstNode: true,
      // this may be undefined for perissioned cache nodes
      secretKey,
    })
  }

  /**
   * Cache class constructor.
   * @public
   * @constructor
   * @param {Resolver} resolver
   * @param {Object} opts
   */
  constructor(resolver, opts) {
    void opts
    super().setMaxListeners(0)

    this.db = null
    this.resolver = resolver
    this.lock = mutex()
    this.peers = new Map()
    this.parse = json.createParser()
    this.swarm = null
    this.ready = util.readyify(this.ready.bind(this))
    this.identity = resolver.identity
    this.discoveryKey = null

    // this.on('peer', this.onpeer)
    this.on('connection', this.onconnection)
  }

  /**
   * Waits for local cache database to be ready. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits ready
   */
  async ready(cb) {
    const { identifier } = this.identity
    const queue = util.queue()

    queue.push((done) => {
      this.identity.ready(done)
    })

    queue.push((done) => {
      this.discoveryKey = crypto.blake2b(this.identity.publicKey)
      done()
    })

    queue.push((done) => {
      this.db = Cache.createDatabase(identifier, this.identity)
      this.db.ready(done)
    })

    queue.push((done) => {
      this.swarm = createSwarm({
        stream: () => this.replicate(),
        id: this.db.local.key,
      })

      this.swarm.join(this.discoveryKey)

      util.forwardEvents(this.swarm, this, [
        'error', 'peer', 'connection'
      ])

      process.nextTick(done)
    })

    queue.push((done) => {
      this.emit('ready')
      done()
    })

    return queue.end(cb)
  }

  /**
   * Closes local cache database. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async close(cb) {
    return this.destroy(cb)
  }

  /**
   * Closes local cache database. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async destroy(cb) {
    const batch = new Batch()
    return pify(done => batch.end(util.callback(cb, done)))()
  }

  /**
   * Get a value by a named key. This function will do a look up,
   * first locally, and then to each known peer, one at a time,
   * until a value can be resolved. If a value is expired (TTL < now())
   * it will not be resolved.
   * @public
   * @param {String} key
   * @param {?(Function)} cb
   * @return {Promise<Object>}
   */
  async get(key, cb) {
    return pify(async (done) => {
      const callback = util.callback(cb, done)
      const lookups = Array.from(this.peers)
        .map(kv => kv[1])
        .concat(this.db)
        .map(onpeer)
        .reverse()

      for (const lookup of lookups) {
        // eslint-disable-next-line no-await-in-loop
        const result = await lookup()
        if (result && result.value) {
          const entry = Entry.fromBuffer(result.value)
          if (entry.ttl >= Date.now()) {
            callback(null, this.parse(entry.value))
            return
          }
        }
      }

      callback(null)
    })()

    function onpeer(peer) {
      return pify((done) => {
        peer.get(key, onget)
        ontimeout.timer = setTimeout(ontimeout, 100)

        function ontimeout() {
          ontimeout.timer = null
          done(null, null)
        }

        function onget(err, result) {
          clearTimeout(ontimeout.timer)
          if (null !== ontimeout.timer) {
            done(err, result)
          }
        }
      })
    }
  }

  /**
   * Store a value by a named key. This function will lock
   * all puts and deletes until this operation completes. This
   * function will update the local database all peers.
   * @public
   * @param {String} key
   * @param {Object} value
   * @param {?(Function)} cb
   * @return {Promise<Object>}
   */
  async put(key, value, cb) {
    const entry = new Entry(value)
    return pify(async (done) => {
      this.lock(async (release) => {
        const callback = util.callback(cb, done, release)
        const puts = Array.from(this.peers)
          .map(kv => kv[1])
          .concat(this.db)
          .map(onpeer)

        try {
          await Promise.all(puts.map(put => put()))
          callback(null)
        } catch (err) {
          callback(err)
        }
      })
    })()

    function onpeer(peer) {
      return pify(done => peer.put(key, entry.toBuffer(), done))
    }
  }

  /**
   * Delete a value by a named key. This function will lock
   * all puts and deletes until this operation completes. This
   * function will update the local database all peers.
   * @public
   * @param {String} key
   * @param {Object} value
   * @param {?(Function)} cb
   * @return {Promise<Object>}
   */
  async del(key, cb) {
    return pify(async (done) => {
      this.lock(async (release) => {
        const callback = util.callback(cb, done, release)
        const dels = Array.from(this.peers)
          .map(kv => kv[1])
          .concat(this.db)
          .map(onpeer)

        try {
          await Promise.all(dels.map(del => del()))
          callback(null)
        } catch (err) {
          callback(err)
        }
      })
    })()

    function onpeer(peer) {
      return pify(done => peer.del(key, done))
    }
  }

  /**
   * Returns a replication stream for the local data base cache
   * @public
   * @return {Duplex}
   */
  replicate() {
    return this.db.replicate()
  }

  /**
   * Add a peer by identifier
   * @public
   * @param {String} identifier
   */
  async addPeer(identifier, cb) {
    return pify((done) => {
      const callback = util.callback(cb, done)
      const did = new DID(identifier)
      const publicKey = Buffer.from(did.identifier, 'hex')
      const db = Cache.createDatabase(did.identifier, { publicKey })
      this.peers.set(identifier, db)
      db.ready(() => {
        db.swarm = createSwarm({ stream: () => db.replicate() })
        db.swarm.join(crypto.blake2b(db.key))
        callback(null, db)
      })
    })()
  }

  /**
   * Handles incomming connections from peer in the
   * cache swarm.
   * @private
   */
  async onconnection(connection, peer) {
    const { swarm, db } = this
    const { id } = peer

    if (id !== swarm.id) {
      const auth = await pify(done => db.authorized(id, done))()
      if (!auth) {
        await pify(done => db.authorize(id, done))()
      }
    }
  }
}

/**
 * Represents an entry for a cache database.
 * @public
 * @class Entry
 */
class Entry {
  /**
   * Creates a new Entry instance from a buffer.
   * @public
   * @static
   * @param {Buffer} buffer
   * @return {Entry}
   */
  static fromBuffer(buffer) {
    const ttl = crypto.uint64.decode(buffer)
    const value = buffer.slice(8)
    return new Entry(value, ttl)
  }

  /**
   * Entry class constructor.
   * @public
   * @constructor
   * @param {Mixed} value
   * @param {?(Number)} ttl
   */
  constructor(value, ttl) {
    this.value = value
    this.ttl = ttl || (Date.now() + (conf.get('cache-ttl') || 0))
  }

  /**
   * Converts entry to a Buffer.
   * @public
   * @return {Buffer}
   */
  toBuffer() {
    const header = crypto.uint64.encode(this.ttl)
    const body = Buffer.from(JSON.stringify(this.value))
    return Buffer.concat([ header, body ])
  }
}

module.exports = {
  Entry,
  Cache,
}
