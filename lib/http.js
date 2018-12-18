const { IdentifiersResponse } = require('./response')
const { EventEmitter } = require('events')
const toRegExp = require('path-to-regexp')
const { DID } = require('did-uri')
const drivers = require('./drivers')
const debug = require('debug')('ara:identity:resolver:http')
const cors = require('cors')
const http = require('turbo-http')
const util = require('./util')
const pify = require('pify')
const conf = require('../conf')
const url = require('url')

const IDENTIFIERS_ROUTE_1_0 = toRegExp('/1.0/identifiers/:did')
const HEALTH_ROUTE_1_0 = toRegExp('/')

const NOT_IMPLEMENTED = 'Not Implemented'
const INTERNAL_ERROR = 'Internal Server Error'
const NOT_FOUND = 'Not Found'
const TIMEOUT = 'Timeout'

const HTTP_DRIVER = 'HttpDriver'

/**
 * Creates a HTTP server for a 'Resolver' instance.
 * @public
 * @class Server
 * @extends EventEmitter
 */
class Server extends EventEmitter {
  /**
   * Creates a JSON buffered response of an IdentifiersResponse
   * object based on input data.
   * @public
   * @static
   * @param {Object} opts
   * @param {Object} opts.id
   * @param {Object} opts.ddo
   * @param {Object} opts.did
   * @param {Object} opts.start
   * @param {Object} opts.methodMetadata
   * @return {Buffer}
   */
  static createResponse(opts) {
    return Buffer.from(JSON.stringify(new IdentifiersResponse({
      didDocument: opts.ddo,
      didReference: opts.did,
      methodMetadata: opts.methodMetadata,
      resolverMetadata: {
        retrieved: new Date(),
        duration: Date.now() - opts.start,
        driverId: opts.id,
        driver: HTTP_DRIVER
      }
    })))
  }

  /**
   * Server class constructor
   * @public
   * @constructor
   * @param {Resolver} resolver
   * @param {Object} opts
   */
  constructor(resolver, opts) {
    void opts
    super().setMaxListeners(0)

    this.resolver = resolver
    this.ready = util.readyify(this.ready.bind(this))
    this.server = http.createServer(this.onrequest.bind(this))
    this.routes = [
      IDENTIFIERS_ROUTE_1_0,
      HEALTH_ROUTE_1_0,
    ]

    util.forwardEvents(this.server, this, [
      'error', 'listening', 'request'
    ])

    process.nextTick(() => this.ready())
    process.nextTick(() => this.emit('ready'))
  }

  /**
   * Returns an object containing information about the server address,
   * like the port and IP family.
   * @public
   * @return {Object}
   */
  address() {
    return this.server.address()
  }

  /**
   * Waits for server to be ready. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   * @emits ready
   */
  async ready(cb) {
    return pify(done => this.once('ready', util.callback(cb, done)))()
  }

  /**
   * Listens on a given port calling 'cb' callback when
   * "listening". This function will attempt to listen on the
   * next available port if the port specified is unavailable.
   * @public
   * @param {?(Number)} port
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async listen(port, cb) {
    const { server } = this

    if ('function' === typeof port) {
      cb = port
      port = 0
    }

    server.listen(port, onlisten)
    server.once('error', onlisten)

    return pify((done) => {
      const callback = util.callback(cb, done)
      server.once('listening', callback)
    })()

    function onlisten(err) {
      if (err && 'EADDRINUSE' === err.code) {
        if ('EADDRINUSE' === err.code) {
          server.listen(0, onlisten)
        } else {
          cb(err)
        }
      } else {
        const addr = server.address()
        server.removeListener('error', onlisten)
        debug('Listening on port %s', addr.port)
      }
    }
  }

  /**
   * Closes server. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async close(cb) {
    return this.destroy(cb)
  }

  /**
   * Closes server. Will call
   * callback when ready, if given.
   * @public
   * @param {?(Function)} cb
   * @return {Promise}
   */
  async destroy(cb) {
    return pify(done => this.server.close(util.callback(cb, done)))()
  }

  /**
   * Cycle a timeout on a request object.
   * @private
   */
  async timeout(req, res) {
    const timeout = conf.get('timeout')
    const ontimeout = this.ontimeout.bind(this, req, res)

    clearTimeout(req.timeout)

    req.didTimeout = false
    req.timeout = setTimeout(ontimeout, timeout)
  }

  /**
   * Handles incoming HTTP requests.
   * @private
   */
  async onrequest(req, res) {
    debug('onrequest:', req.method, req.url)

    if ('GET' !== req.method.toUpperCase()) {
      this.onnotfound(req, res)
      return
    }

    const uri = url.parse(req.url)

    for (const route of this.routes) {
      try {
        req.params = route.exec(uri.pathname).slice(1)
        req.route = route
      } catch (err) {
        debug(err)
      }

      if (req.params) {
        break
      }
    }

    if ('function' !== typeof this[req.route]) {
      this.onnotimplemented(req, res)
      return
    }

    if (!req.headers) {
      req.headers = req.getAllHeaders()
    }

    cors()(req, res, async () => {
      try {
        await this[req.route](req, res)
      } catch (err) {
        req.error = err
        this.oninternalerror(req, res)
      }
    })
  }

  /**
   * Handles unknown route requests.
   * @private
   */
  onnotfound(req, res) {
    debug('not found:', req.method, req.url)
    res.statusCode = 404
    res.ended = true
    res.end(NOT_FOUND)
  }

  /**
   * Handles unimplemented route requests.
   * @private
   */
  onnotimplemented(req, res) {
    debug('not implemented:', req.method, req.url)
    res.statusCode = 503
    res.end(NOT_IMPLEMENTED)
    res.ended = true
  }

  /**
   * Handles internal errors.
   * @private
   */
  oninternalerror(req, res) {
    debug('internal error:', req.method, req.url)
    res.statusCode = 500
    res.ended = true
    res.end(req.error ? req.error.message : INTERNAL_ERROR)
  }

  /**
   * Handles request timeouts.
   * @private
   */
  ontimeout(req, res) {
    if (res.ended) {
      clearTimeout(req.timeout)
      return
    }

    debug('timeout:', req.method, req.url)
    req.didTimeout = true
    res.statusCode = 408
    res.ended = true
    res.end(TIMEOUT)
  }

  /**
   * Route to respond to health checks
   */
  async [HEALTH_ROUTE_1_0](req, res) {
    res.statusCode = 200
    res.ended = true
    res.end()
  }

  /**
   * Handles all '/1.0/identifiers/.*' routes and calls
   * the corresponding driver.
   * @private
   */
  async [IDENTIFIERS_ROUTE_1_0](req, res) {
    if (!req.params || 0 === req.params.length) {
      this.onnotfound(req, res)
      return
    }

    const did = new DID(req.params[0])
    const driver = drivers[did.method]

    if (!driver || 'function' !== typeof driver.resolve) {
      this.onnotimplemented(req, res)
      return
    }

    this.timeout(req, res)

    try {
      const now = Date.now()
      const ddo = await this.resolver.cache.get(did.identifier)

      if (req.didTimeout) {
        return
      }

      if (ddo) {
        const response = Server.createResponse({
          ddo, did, start: now, id: `did:${did.method}`
        })

        res.ended = true
        res.setHeader('content-type', 'application/json')
        res.end(response)
        return
      }
    } catch (err) {
      debug(err)
    }

    this.timeout(req, res)

    try {
      const now = Date.now()
      const ddo = await driver.resolve(did, req, res)

      if (req.didTimeout) {
        return
      }

      if (ddo) {
        const response = Server.createResponse({
          ddo, did, start: now, id: `did:${did.method}`
        })

        res.ended = true
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(response)

        // store in cache and fail silently
        try {
          await this.resolver.cache.put(did.identifier, ddo)
        } catch (err) {
          debug(err)
        }
      } else {
        this.onnotfound(req, res)
      }
    } catch (err) {
      debug(err)
      this.oninternalerror(req, res)
    }
  }
}

module.exports = {
  Server
}
