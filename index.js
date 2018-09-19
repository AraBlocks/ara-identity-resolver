/** eslint-disable loop-func */
const { createSwarm, createChannel } = require('ara-network/discovery')
const { parse: parseDID } = require('did-uri')
const { unpack, keyRing } = require('ara-network/keys')
const { info, warn } = require('ara-console')('identity-resolver')
const { resolve } = require('path')
const toRegExp = require('path-to-regexp')
const inquirer = require('inquirer')
const coalesce = require('defined')
const { DID } = require('did-uri')
const hyperdb = require('hyperdb')
const crypto = require('ara-crypto')
const jitson = require('jitson')
const debug = require('debug')('ara:network:node:identity-resolver')
const http = require('turbo-http')
const pify = require('pify')
const aid = require('ara-identity')
const pkg = require('./package.json')
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
  // in milliseconds
  'cache-ttl': 10 * 1000,
  // path to cache data directory
  'cache-root': rc.network.identity.resolver.cache.data.root,
  // an array of public keys for hyperdb cache nodes
  'cache-nodes': rc.network.identity.resolver.cache.nodes || [],
  // in milliseconds
  timeout: REQUEST_TIMEOUT,
  port: rc.network.identity.resolver.http.port,
}

let cache = null
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
      'port', 'timeout',
      'cache-ttl', 'cache-root', 'cache-node',
      'dns-announce-interval', 'dht-announce-interval'
    ], 'Server Options:')
      .option('port', {
        type: 'number',
        alias: 'p',
        default: conf.port,
        describe: 'Port for network node to listen on.',
      })
      .option('timeout', {
        type: 'number',
        default: conf.timeout,
        describe: 'Request timeout (in milliseconds)',
        requiresArg: true,
      })
      .option('cache-ttl', {
        type: 'number',
        describe: 'Max age for entries in cache',
        default: conf['cache-ttl']
      })
      .option('cache-root', {
        type: 'string',
        default: conf['cache-root'],
        describe: 'Path to cache data root',
        requiresArg: true,
      })
      .option('cache-node', {
        type: 'string',
        default: conf['cache-nodes'],
        describe: 'Another resolver node public key to share cache with',
        requiresArg: true,
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
  conf['cache-root'] = select('cache-root', argv, opts, conf)
  conf['dns-announce-interval'] = select('dns-announce-interval', argv, opts, conf)
  conf['dht-announce-interval'] = select('dht-announce-interval', argv, opts, conf)

  const nodes = select('cache-node', argv, opts, conf)

  if (Array.isArray(nodes)) {
    conf['cache-nodes'] = nodes
  } else if (nodes) {
    conf['cache-nodes'] = [ nodes ]
  }

  function select(k, ...args) {
    return coalesce(...args.map(o => o[k]))
  }
}

async function start(argv) {
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

  let secretKey = null
  let publicKey = null
  let keyring = null

  password = crypto.blake2b(Buffer.from(password))

  // attempt to decode keyring with a supplied secret falling
  // back to an authenticated decode with the identity associated
  // with this network node
  try {
    const secret = Buffer.from(conf.secret)
    keyring = keyRing(conf.keyring, { secret })

    await keyring.ready()

    const buffer = await keyring.get(conf.network)
    const unpacked = unpack({ buffer })
    Object.assign(conf, { discoveryKey: unpacked.discoveryKey })
  } catch (err) {
    debug(err)

    try {
      const key = password.slice(0, 16)
      const keystore = json.keystore.parse(await aid.fs.readFile(
        conf.identity,
        'keystore/ara'
      ))

      publicKey = Buffer.from(identifier, 'hex')
      secretKey = ss.decrypt(keystore, { key })
      keyring = keyRing(conf.keyring, { secret: secretKey })

      await keyring.ready()

      const buffer = await keyring.get(conf.network)
      Object.assign(conf, unpack({ buffer }))
    } catch (err) { // eslint-disable-line no-shadow
      debug(err)
      throw new Error('Unable to decode keys in keyring for identity.')
    }
  }

  const announcementTimeout = setTimeout(announce, 1000)

  server = http.createServer(onrequest)
  channel = createChannel({
    dht: { interval: conf['dht-announce-interval'] },
    dns: { interval: conf['dns-announce-interval'] },
  })

  server.listen(conf.port, onlisten)
  server.once('error', (err) => {
    if (err && 'EADDRINUSE' === err.code) {
      server.listen(0, onlisten)
    }
  })

  cache = hyperdb(resolve(conf['cache-root'], identifier), publicKey, {
    // dont store secretKey on disk
    storeSecretKey: false,
    // set to true to reduce the nodes array to the first node in it
    firstNode: true,
    secretKey,
  })

  await new Promise((done, onerror) => {
    cache.once('ready', done).once('error', onerror)
  })

  cache.swarm = createSwarm({
    id: cache.local.key,
    stream() {
      return cache.replicate({
        userData: cache.key,
        live: true,
      })
    }
  })

  /**
  // cache DDO for this identity
  //await put(
    //identifier,
    //await aid.fs.readFile(identifier, 'ddo.json')
  //)
  */

  warn('cache: swarm: join:', publicKey.toString('hex'))
  cache.swarm.join(crypto.blake2b(publicKey).toString('hex'))
  cache.swarm.on('connection', onconnection)

  for (const k of conf['cache-nodes']) {
    const did = new DID(aid.did.normalize(k))
    const key = Buffer.from(did.identifier, 'hex')
    authorize(did.identifier)
    warn('cache: swarm: node: join:', key.toString('hex'))
    cache.swarm.join(crypto.blake2b(key).toString('hex'))
  }

  return true

  async function get(key, ttl) {
    return pify(async (done) => {
      let didTimeout = false
      const timer = setTimeout(ontimeout, ttl || 1000)
      const entry = await pify(cache.get.bind(cache))(key)

      clearTimeout(timer)

      if (didTimeout || !entry || !entry.value) {
        debug('cache: miss:', key)
        done(null)
      } else {
        const timestamp = crypto.uint64.decode(entry.value)
        const buffer = entry.value.slice(8)
        const now = Date.now()

        done(null, buffer)

        if (now - timestamp >= conf['cache-ttl']) {
          debug('cache: expire:', key)
          await put(key, await aid.fs.readFile(key, 'ddo.json', { cache: false }))
        }
      }

      function ontimeout() {
        debug('cache: get: did timeout')
        didTimeout = true
      }
    })()
  }

  async function put(key, buffer) {
    const timestamp = Date.now()
    const entry = Buffer.concat([
      crypto.uint64.encode(timestamp),
      buffer
    ])

    warn('cache: put:', timestamp, key)
    return pify(cache.put.bind(cache))(key, entry)
  }

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

  async function authorize(id) {
    const did = new DID(aid.did.normalize(id))
    const key = Buffer.from(did.identifier, 'hex')

    try {
      const auth = await pify(cache.authorized.bind(cache))(key)
      if (auth) {
        warn('cache: authorized:', did.identifier)
      } else {
        warn('cache: authorizing:', did.identifier)
        await pify(cache.authorize.bind(cache))(key)
        warn('cache: authorized:', did.identifier)
      }

      return true
    } catch (err) {
      debug(err)
      return false
    }
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

  async function onconnection(connection, peer) {
    if (peer.id && peer.id !== cache.id && await authorize(peer.id.toString('hex'))) {
      warn(
        'cache: node: replicate: id=%s channel=%s host=%s',
        peer && peer.id ? toHex(peer.id) : null,
        peer && peer.channel ? toHex(peer.channel) : null,
        peer && peer.host ? `${peer.host}:${peer.port}` : null,
      )
    }
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
      notFound()
      return
    }

    if (!req.params || 0 === req.params.length) {
      notFound()
      return
    }

    const now = Date.now()

    try {
      did = parseDID(req.params[0])
      debug('ondid:', did.reference)
      const entry = await get(did.identifier)

      if (entry) {
        debug('cache: hit:', did.reference)
        const buffer = entry
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

      req.socket.on('close', onclose)
      req.socket.on('end', onclose)

      try {
        const timeout = setTimeout(ontimeout, conf.timeout || REQUEST_TIMEOUT)
        const buffer = await aid.fs.readFile(did.identifier, 'ddo.json', {
          cache: false
        })

        clearTimeout(timeout)

        if (didTimeout) {
          return
        }

        const duration = Date.now() - now

        if (false === closed) {
          const response = createResponse({ did, buffer, duration })
          await put(did.identifier, buffer)

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
