const { createSwarm, createChannel } = require('ara-network/discovery')
const { parse: parseDID } = require('did-uri')
const { unpack, keyRing } = require('ara-network/keys')
const { info, warn } = require('ara-console')
const { createCFS } = require('cfsnet/create')
const { readFile } = require('fs')
const { resolve } = require('path')
const inquirer = require('inquirer')
const coalesce = require('defined')
const { DID } = require('did-uri')
const express = require('express')
const crypto = require('ara-crypto')
const debug = require('debug')('ara:network:node:identity-resolver')
const http = require('http')
const pify = require('pify')
const ram = require('random-access-memory')
const lru = require('lru-cache')
const rc = require('./rc')()
const ss = require('ara-secret-storage')

// in milliseconds
const kRequestTimeout = 200

const conf = {
  // in milliseconds
  'dns-announce-interval': 1000 * 60 * 2,
  // in milliseconds
  'dht-announce-interval': 1000 * 60 * 2,
  'cache-max': Infinity,
  // in milliseconds
  'cache-ttl': 1000 * 5,
  port: rc.network.identity.resolver.http.port,
  key: null,
}

let app = null
let server = null
let channel = null

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
      .option('i', {
        alias: 'identity',
        default: rc.network.identity.whoami,
        describe: 'Ara Identity for the network node',
      })
      .option('s', {
        alias: 'secret',
        describe: 'Shared secret key'
      })
      .option('n', {
        alias: 'network',
        describe: 'Human readable network name for keys in keyring.'
      })
      .option('k', {
        alias: 'keyring',
        default: rc.network.identity.keyring,
        describe: 'Path to ARA network keys'
      })
      .option('p', {
        alias: 'port',
        describe: 'Port for network node to listen on.',
        default: rc.network.identity.resolver.http.port
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
  conf.network = select('network', argv, opts, conf)
  conf.identity = select('identity', argv, opts, conf)

  conf['cache-max'] = select('cache-max', argv, opts, conf)
  conf['cache-ttl'] = select('cache-ttl', argv, opts, conf)
  conf['dns-announce-interval'] = select('dns-announce-interval', argv, opts, conf)
  conf['dht-announce-interval'] = select('dhy-announce-interval', argv, opts, conf)

  function select(k, ...args) {
    return coalesce(...args.map(o => o[k]))
  }
}

async function start(argv) {
  const lookup = {}
  const cache = lru({
    dispose,
    maxAge: 2 * conf['cache-ttl'],
    max: 2 * conf['cache-max'],
  })

  const routeCache = lru({
    maxAge: conf['cache-ttl'],
    max: conf['cache-max'],
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
    debug('')
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
      const keystore = JSON.parse(await pify(readFile)(path, 'utf8'))
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

  app = express()
  server = http.createServer(app)
  channel = createChannel({
    dht: { interval: conf['dht-announce-interval'] },
    dns: { interval: conf['dns-announce-interval'] },
  })

  const announcementTimeout = setTimeout(announce, 1000)

  app.get('/1.0/identifiers/*?', onidentifier)

  server.listen(argv.port, onlisten)
  server.once('error', (err) => {
    if (err && 'EADDRINUSE' === err.code) {
      server.listen(0, onlisten)
    }
  })

  return true

  function onlisten() {
    const { port } = server.address()
    info('identity-resolver: HTTP server listening on port %s', port)
    announce()
  }

  function dispose(key, cfs) {
    if (key && cfs) {
      delete lookup[toHex(cfs.key)]
      warn('Disposing of %s', key)

      if (cfs.discovery) {
        cfs.discovery.destroy()
      }

      cfs.close()
    }
  }

  function announce() {
    const { port } = server.address()
    clearTimeout(announcementTimeout)
    channel.join(conf.discoveryKey, port)
    info(
      'identity-resolver: Announcing %s on port %s',
      toHex(conf.discoveryKey),
      port
    )
  }

  function put(did, cfs) {
    if (did && did.identifier && cfs && cfs.discoveryKey) {
      cache.set(toHex(crypto.blake2b(cfs.key)), cfs)
      lookup[did.identifier] = cfs
    }
  }

  function del(did, cfs) {
    if (did && did.identifier) {
      delete lookup[did.identifier]
    }

    if (cfs && cfs.discoveryKey) {
      cache.del(toHex(crypto.blake2b(cfs.key)))
    }
  }

  function get(did) {
    const cfs = did && did.identifier ? lookup[did.identifier] : null

    if (cfs) {
      return cache.get(toHex(crypto.blake2b(cfs.key)))
    }

    return null
  }

  function has(did) {
    const key = did && did.identifier
    const dkey = key && crypto.blake2b(Buffer.from(key, 'hex'))
    return Boolean(key && (key in lookup) && cache.peek(toHex(dkey)))
  }

  async function onidentifier(req, res) {
    let didTimeout = false
    let closed = false
    let did = null

    const now = Date.now()

    try {
      did = parseDID(req.params[0])
      debug('onidentifier:', did.reference)

      if (routeCache.has(did.reference)) {
        const buffer = routeCache.get(did.reference)
        const duration = Date.now() - now
        const response = createResponse({ did, buffer, duration })
        res.set('content-type', 'application/json')
        res.send(response)
        info('%s: ddo.json (cache)', did.identifier)
        return
      }

      if ('ara' !== did.method) {
        debug(`${did.method} method is not implemented`)
        notImplemented()
        return
      }

      if (has(did)) {
        await onconnection()
        return
      }

      const key = Buffer.from(did.identifier, 'hex')
      const id = toHex(key)

      // stub
      put(did, { id, key })

      // @TODO(jwerle): Cache on disk, instead of always using RAM in ms
      const ttl = 1000 * 60
      const cfs = await createCFS({
        key,
        id,
        sparseMetadata: true,
        shallow: true,
        // @TODO(jwerle): Figure out an on-disk cache
        storage: ram,
        sparse: true,
      })

      const timeout = setTimeout(ontimeout, kRequestTimeout)

      put(did, cfs)

      cfs.download('ddo.json').catch(debug)

      cfs.discovery = createSwarm({
        stream: () => cfs.replicate(),
        utp: false
      })

      cfs.discovery.once('connection', () => setTimeout(onexpire, ttl))
      cfs.discovery.once('connection', () => clearTimeout(timeout))
      cfs.discovery.once('connection', onconnection)
      cfs.discovery.join(cfs.discoveryKey)

      req.once('close', onclose)
      req.once('end', onclose)

      async function onexpire() {
        if (false === closed) {
          setTimeout(onexpire, ttl)
        } else {
          del(did, get(did))
        }
      }
    } catch (err) {
      debug(err)
      warn('error:', err.message)
    }

    function notImplemented() {
      if (false === closed) {
        return res.status(503).end()
      }
      return null
    }

    function notFound() {
      if (false === closed) {
        return res.status(404).end()
      }
      return null
    }

    function internalError() {
      if (false === closed) {
        return res.status(500).end()
      }
      return null
    }

    async function onconnection() {
      info('%s: onconnection', did.identifier)

      if (false === has(did)) {
        notFound()
        return
      }

      const cfs = get(did)

      if (!cfs && routeCache.has(did.reference)) {
        const buffer = routeCache.get(did.reference)
        const duration = Date.now() - now
        const response = createResponse({ did, buffer, duration })

        routeCache.set(did.reference, buffer)
        res.set('content-type', 'application/json')
        res.send(response)

        info('%s: ddo.json (cache)', did.identifier)
        return
      }

      try {
        const timeout = setTimeout(ontimeout, kRequestTimeout)
        const buffer = await cfs.readFile('ddo.json')

        clearTimeout(timeout)

        if (didTimeout) {
          return
        }

        const duration = Date.now() - now

        if (false === closed) {
          const response = createResponse({ did, buffer, duration })
          routeCache.set(did.reference, buffer)
          res.set('content-type', 'application/json')
          res.send(response)
        }

        info('%s: ddo.json', did.identifier)
      } catch (err) {
        debug(err)
        internalError()
      } finally {
        onclose()
      }
    }

    async function ontimeout() {
      didTimeout = true
      del(did, get(did))
      onclose()
      return notFound()
    }

    async function onclose() {
      if (false === closed) {
        closed = true
        const cfs = get(did)
        if (cfs && cfs.discovery) {
          cfs.discovery.destroy()
          cfs.discovery = null
        }
      }
    }

    function createResponse(opts) {
      return {
        didDocument: JSON.parse(opts.buffer),
        didReference: opts.did,
        methodMetadata: {},
        resolverMetadata: {
          retrieved: new Date(),
          duration: opts.duration,
          driverId: 'did:ara',
          driver: 'HttpDriver',
        }
      }
    }
  }
}

async function stop() {
  if (null === server) { return false }

  warn('identity-resolver: Stopping the server!!')
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
