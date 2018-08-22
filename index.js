const { createSwarm, createChannel } = require('ara-network/discovery')
const { parse: parseDID } = require('did-uri')
const { unpack, keyRing } = require('ara-network/keys')
const { info, warn } = require('ara-console')
const { createCFS } = require('cfsnet/create')
const { readFile } = require('fs')
const { resolve } = require('path')
const inquirer = require('inquirer')
const { DID } = require('did-uri')
const express = require('express')
const crypto = require('ara-crypto')
const extend = require('extend')
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

async function getInstance() {
  return server
}

async function configure(opts, program) {
  if (program) {
    const { argv } = program
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
        alias: 'name',
        describe: 'Human readable network keys name.'
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

    if (argv.identity && 0 !== argv.identity.indexOf('did:ara:')) {
      argv.identity = `did:ara:${argv.identity}`
    }

    extend(true, opts, argv)
  }

  return extend(true, conf, opts)
}

async function start(argv) {
  const lookup = {}
  const cache = lru({ dispose }, conf['cache-max'], conf['cache-ttl'])

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

  const did = new DID(conf.identity)
  const publicKey = Buffer.from(did.identifier, 'hex')

  password = crypto.blake2b(Buffer.from(password))

  const hash = crypto.blake2b(publicKey).toString('hex')
  const path = resolve(rc.network.identity.root, hash, 'keystore/ara')

  // attempt to decode keyring with a supplied secret falling
  // back to an authenticated decode with the identity associated
  // with this network node
  try {
    debug('')
    const secret = Buffer.from(conf.secret)
    const keyring = keyRing(conf.keyring, { secret })

    await keyring.ready()

    const buffer = await keyring.get(conf.name)
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

      const buffer = await keyring.get(conf.name)
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
      warn('Disposing of %s', key)

      if (cfs.discovery) {
        cfs.discovery.destroy()
      }

      cfs.close()
      delete lookup[cfs.key.toString('hex')]
    }
  }

  function announce() {
    const { port } = server.address()
    clearTimeout(announcementTimeout)
    channel.join(conf.discoveryKey, port)
    info(
      'identity-resolver: Announcing %s on port %s',
      conf.discoveryKey.toString('hex'),
      port
    )
  }

  function put(did, cfs) {
    if (did && did.identifier && cfs && cfs.discoveryKey) {
      cache.set(cfs.discoveryKey.toString('hex'), cfs)
      lookup[did.identifier] = cfs
    }
  }

  function del(did, cfs) {
    if (did && did.identifier) {
      delete lookup[did.identifier]
    }

    if (cfs && cfs.discoveryKey) {
      cache.del(cfs.discoveryKey.toString('hex'))
    }
  }

  function get(did) {
    const cfs = did && did.identifier ? lookup[did.identifier] : null
    if (cfs) { return cache.get(cfs.discoveryKey.toString('hex')) }
    return cfs
  }

  function has(did) {
    return did && did.identifier in lookup
  }

  async function onidentifier(req, res) {
    let closed = false
    let did = null
    const now = Date.now()

    try {
      did = parseDID(req.params[0])
      debug('onidentifier:', did.reference)

      if ('ara' !== did.method) {
        debug(`${did.method} method is not implemented`)
        return notImplemented()
      }

      if (has(did)) {
        return await onconnection()
      }

      const key = Buffer.from(did.identifier, 'hex')
      const id = key.toString('hex')

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
      if (false === has(did)) { return }
      const cfs = get(did)

      try {
        const timeout = setTimeout(notFound, kRequestTimeout)
        const buffer = await cfs.readFile('ddo.json')
        clearTimeout(timeout)
        const duration = Date.now() - now
        if (false === closed) {
          const response = {
            didReference: did,
            didDocument: JSON.parse(buffer.toString('utf8')),
            methodMetadata: {},
            resolverMetadata: {
              driverId: 'did:ara',
              driver: 'HttpDriver',
              retrieved: new Date(),
              duration
            }
          }
          res.set('content-type', 'application/json')
          res.send(response)
        }
        info('%s: ddo.json ', did.identifier)
      } catch (err) {
        debug(err)
        internalError()
      } finally {
        onclose()
      }
    }

    async function ontimeout() {
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
    return null
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
