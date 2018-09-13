const { createSwarm, createChannel } = require('ara-network/discovery')
const { parse: parseDID } = require('did-uri')
const { unpack, keyRing } = require('ara-network/keys')
const { info, warn } = require('ara-console')('identity-resolver')
const { createCFS } = require('cfsnet/create')
const { readFile } = require('fs')
const { resolve } = require('path')
const multidrive = require('multidrive')
const toRegExp = require('path-to-regexp')
const inquirer = require('inquirer')
const coalesce = require('defined')
const { DID } = require('did-uri')
const crypto = require('ara-crypto')
const jitson = require('jitson')
const toilet = require('toiletdb/inmemory')
const debug = require('debug')('ara:network:node:identity-resolver')
const http = require('turbo-http')
const pify = require('pify')
const pkg = require('./package.json')
const ram = require('random-access-memory')
const lru = require('lru-cache')
const url = require('url')
const rc = require('./rc')()
const ss = require('ara-secret-storage')

// in milliseconds
const REQUEST_TIMEOUT = 5 * 1000
const IDENTIFIERS_ROUTE_1_0 = toRegExp('/1.0/identifiers/:did')

const conf = {
  // in milliseconds
  'dns-announce-interval': 2 * 60 * 1000,
  // in milliseconds
  'dht-announce-interval': 2 * 60 * 1000,
  'cache-max': Infinity,
  // in milliseconds
  'cache-ttl': 5 * 1000,
  // in milliseconds
  timeout: REQUEST_TIMEOUT,
  port: rc.network.identity.resolver.http.port,
}

let server = null
let channel = null

const json = {
  keystore: { parse: jitson({ sampleInterval: 1 }) },
  didDocument: { parse: jitson({ sampleInterval: 1 }) },
}

function toHex(b) {
  return b.toString('hex')
}

async function getInstance() {
  return server
}

async function configure(opts, program) {
  let argv = {}
  if (program) {
    program
      .wrap(null)
      .version('version', 'Show version number', pkg.version)
      .group([ 'identity', 'secret', 'keyring', 'network' ], 'Network Options:')
      .option('identity', {
        alias: 'i',
        default: rc.network.identity.whoami,
        requiresArg: true,
        required: true,

        defaultDescription: (
          rc.network.identity.whoami
            ? `${rc.network.identity.whoami.slice(0, 16)}...`
            : undefined
        ),

        describe:
`A valid, local, and resolvable Ara identity DID
URI of the owner of the given keyring. You will be
prompted for the associated passphrase`,
      })
      .option('secret', {
        alias: 's',
        describe: 'Shared secret key for the associated network keys',
        required: true,
        requiresArg: true,
      })
      .option('keyring', {
        alias: 'k',
        default: rc.network.identity.keyring,
        describe: 'Path to Ara network keyring file',
        required: true,
        requiresArg: true,
      })
      .option('network', {
        alias: 'n',
        describe: 'Human readable network name for keys in keyring',
        required: true,
        requiresArg: true,
      })

    program.group([
      'port', 'timeout', 'cache-max', 'cache-ttl',
      'dns-announce-interval', 'dht-announce-interval'
    ], 'Server Options:')
      .option('port', {
        type: 'number',
        alias: 'p',
        default: rc.network.identity.resolver.http.port,
        describe: 'Port for network node to listen on.',
      })
      .option('timeout', {
        type: 'number',
        default: conf.timeout,
        describe: 'Request timeout (in milliseconds)',
        requiresArg: true,
      })
      .option('cache-max', {
        type: 'number',
        describe: 'Max entries in cache',
        default: conf['cache-max']
      })
      .option('cache-ttl', {
        type: 'number',
        describe: 'Max age for entries in cache',
        default: conf['cache-ttl']
      })
      .option('dns-announce-interval', {
        type: 'number',
        describe: 'Network announcement interval over DNS (milliseconds)',
        default: conf['dns-announce-interval'],
      })
      .option('dht-announce-interval', {
        type: 'number',
        describe: 'Network announcement interval over DHT (milliseconds)',
        default: conf['dht-announce-interval'],
      })

    // eslint-disable-next-line prefer-destructuring
    argv = program.argv
  }

  if (argv.identity && 0 !== argv.identity.indexOf('did:ara:')) {
    argv.identity = `did:ara:${argv.identity}`
  }

  conf.port = select('port', argv, opts, conf)
  conf.secret = select('secret', argv, opts, conf)
  conf.keyring = select('keyring', argv, opts, conf)
  conf.network = select('network', argv, opts, conf) || argv.name
  conf.identity = select('identity', argv, opts, conf)

  if (argv.name && !argv.network) {
    warn('Please use \'--network\' instead of \'--name\'.')
  }

  conf['cache-max'] = select('cache-max', argv, opts, conf)
  conf['cache-ttl'] = select('cache-ttl', argv, opts, conf)
  conf['dns-announce-interval'] = select('dns-announce-interval', argv, opts, conf)
  conf['dht-announce-interval'] = select('dht-announce-interval', argv, opts, conf)

  function select(k, ...args) {
    return coalesce(...args.map(o => o[k]))
  }
}

async function start(argv) {
  const cache = lru({
    maxAge: conf['cache-ttl'],
    max: conf['cache-max'],
    async dispose(key) {
      await pify(store.close)(key)
    }
  })

  let { password } = argv

  if (!password) {
    const res = await inquirer.prompt([ {
      type: 'password',
      name: 'password',
      message:
      'Please enter the passphrase associated with the node identity.\n' +
      'Passphrase:'
    } ])

    // eslint-disable-next-line
    password = res.password
  }

  const { identifier } = new DID(conf.identity)
  const publicKey = Buffer.from(identifier, 'hex')

  password = crypto.blake2b(Buffer.from(password))

  const hash = toHex(crypto.blake2b(publicKey))
  const path = resolve(rc.network.identity.root, hash, 'keystore/ara')

  // attempt to decode keyring with a supplied secret falling
  // back to an authenticated decode with the identity associated
  // with this network node
  try {
    const secret = Buffer.from(conf.secret)
    const keyring = keyRing(conf.keyring, { secret })

    await keyring.ready()

    const buffer = await keyring.get(conf.network)
    const unpacked = unpack({ buffer })
    Object.assign(conf, { discoveryKey: unpacked.discoveryKey })
  } catch (err) {
    debug(err)

    try {
      const key = password.slice(0, 16)
      const keystore = json.keystore.parse(await pify(readFile)(path, 'utf8'))
      const secretKey = ss.decrypt(keystore, { key })
      const keyring = keyRing(conf.keyring, { secret: secretKey })

      await keyring.ready()

      const buffer = await keyring.get(conf.network)
      const unpacked = unpack({ buffer })
      Object.assign(conf, { discoveryKey: unpacked.discoveryKey })
    } catch (err) { // eslint-disable-line no-shadow
      debug(err)
      throw new Error('Unable to decode keys in keyring for identity.')
    }
  }

  const resolvers = {}

  const store = await pify(multidrive)(
    toilet(),
    async (opts, done) => {
      const id = Buffer.from(opts.id, 'hex').toString('hex')
      const key = Buffer.from(opts.key, 'hex')

      info('create cfs:', id)

      try {
        const config = Object.assign({}, opts, { id, key, shallow: true })
        const cfs = await createCFS(config)

        if (!resolvers[opts.id]) {
          const resolver = createSwarm({
            stream: () => cfs.replicate({ live: false })
          })

          resolvers[opts.id] = resolver
          resolver.setMaxListeners(Infinity)
          resolver.join(cfs.discoveryKey)
          info('join:', cfs.discoveryKey.toString('hex'))
        }

        done(null, cfs)
      } catch (err) {
        done(err)
      }
    },

    async (cfs, done) => {
      try {
        await cfs.close()
        done(null)
      } catch (err) {
        done(err)
      }
    }
  )

  const announcementTimeout = setTimeout(announce, 1000)

  server = http.createServer(onrequest)
  channel = createChannel({
    dht: { interval: conf['dht-announce-interval'] },
    dns: { interval: conf['dns-announce-interval'] },
  })

  server.listen(argv.port, onlisten)
  server.once('error', (err) => {
    if (err && 'EADDRINUSE' === err.code) {
      server.listen(0, onlisten)
    }
  })

  return true

  function announce() {
    const { port } = server.address()
    clearTimeout(announcementTimeout)
    channel.join(conf.discoveryKey, port)
    info(
      'Announcing %s on port %s',
      toHex(conf.discoveryKey),
      port
    )
  }

  function createResponse(opts) {
    return JSON.stringify({
      didDocument: json.didDocument.parse(opts.buffer),
      didReference: opts.did,
      methodMetadata: {},
      resolverMetadata: {
        retrieved: new Date(),
        duration: opts.duration,
        driverId: 'did:ara',
        driver: 'HttpDriver',
      }
    })
  }

  function onlisten() {
    const { port } = server.address()
    info('HTTP server listening on port %s', port)
    announce()
  }

  async function onrequest(req, res) {
    debug('onrequest:', req.method, req.url)

    let didTimeout = false
    let closed = false
    let did = null

    if ('GET' !== req.method.toUpperCase()) {
      notFound()
      return
    }

    try {
      const uri = url.parse(req.url)
      req.params = IDENTIFIERS_ROUTE_1_0.exec(uri.pathname).slice(1)
    } catch (err) {
      debug(err)
      internalError()
      return
    }

    if (!req.params || 0 === req.params.length) {
      notFound()
      return
    }

    const now = Date.now()

    try {
      did = parseDID(req.params[0])
      debug('onrequest:', did.reference)

      if (cache.has(did.identifier)) {
        const buffer = cache.get(did.identifier)
        const duration = Date.now() - now
        const response = createResponse({ did, buffer, duration })
        res.setHeader('content-type', 'application/json')
        res.end(response, response.length, (err) => {
          if (err) {
            debug(err)
          } else {
            info('%s: send ddo.json (cache)', did.identifier)
          }
        })
        return
      }

      if ('ara' !== did.method) {
        debug(`${did.method} method is not implemented`)
        notImplemented()
        return
      }

      const key = Buffer.from(did.identifier, 'hex')
      const id = toHex(key)

      const cfs = await pify(store.create)({
        sparseMetadata: true,
        shallow: true,
        storage: ram,
        sparse: true,
        key,
        id,
      })

      cfs.download('ddo.json').catch(debug)

      req.socket.on('close', onclose)
      req.socket.on('end', onclose)

      try {
        const timeout = setTimeout(ontimeout, conf.timeout || REQUEST_TIMEOUT)
        const buffer = await cfs.readFile('ddo.json')

        clearTimeout(timeout)

        if (didTimeout) {
          return
        }

        const duration = Date.now() - now

        if (false === closed) {
          const response = createResponse({ did, buffer, duration })
          cache.set(did.identifier, buffer)
          res.setHeader('content-type', 'application/json')
          res.end(response, response.length, (err) => {
            if (err) {
              debug(err)
            } else {
              info('%s: send ddo.json (cache)', did.identifier)
            }
          })
          info('%s: send ddo.json', did.identifier)
        }
      } catch (err) {
        debug(err)
        internalError()
      }
    } catch (err) {
      debug(err)
      warn('error:', err.message)
    }

    function onclose() {
      closed = true
    }

    async function ontimeout() {
      warn('request did timeout for', did.reference)
      didTimeout = true
      notFound()
    }

    function notImplemented() {
      if (false === closed) {
        res.statusCode = 503
        res.end()
      }
    }

    function notFound() {
      if (false === closed) {
        res.statusCode = 404
        res.end()
      }
    }

    function internalError() {
      if (false === closed) {
        res.statusCode = 500
        res.end()
      }
    }
  }
}

async function stop() {
  if (null === server) { return false }

  warn('Stopping')
  server.close(onclose)
  return true
  function onclose() {
    server = null
  }
}

module.exports = {
  getInstance,
  configure,
  start,
  stop
}
