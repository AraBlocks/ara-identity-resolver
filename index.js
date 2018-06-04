'use strict'

const { info, warn, error } = require('ara-console')
const { parse: parseDID } = require('did-uri')
const { createChannel } = require('ara-network/channel')
const { createServer } = require('ara-network/discovery')
const { createCFS } = require('cfsnet/create')
const express = require('express')
const secrets = require('ara-network/secrets')
const extend = require('extend')
const debug = require('debug')('ara:network:node:identity-resolver')
const http = require('http')
const pify = require('pify')
const pump = require('pump')
const ram = require('random-access-memory')
const fs = require('fs')

const kRequestTimeout = 200 // in milliseconds

const conf = {
  'dns-announce-interval': 1000 * 60 * 2, // in milliseconds
  'dht-announce-interval': 1000 * 60 * 2, // in milliseconds
  keystore: null,
  port: 8000,
  key: null,
}

let app = null
let server = null
let channel = null

async function getInstance (argv) {
  return server
}

async function configure (opts, program) {
  if (program) {
    const { argv } = program
      .option('port', {
        alias: 'p',
        type: 'number',
        describe: 'HTTP server port to listen on',
        default: conf.port
      })
      .option('key', {
        type: 'string',
        alias: 'k',
        describe: 'Network key.'
      })
      .option('dns-announce-interval', {
        type: 'number',
        describe: "Network announcement interval over DNS (milliseconds)",
        default: conf['dns-announce-interval'],
      })
      .option('dht-announce-interval', {
        type: 'number',
        describe: "Network announcement interval over DHT (milliseconds)",
        default: conf['dht-announce-interval'],
      })

    extend(true, opts, argv)
  }

  return extend(true, conf, opts)
}

async function start (argv) {
  const lookup = {}

  const keystore = {}
  const keys = {
    discoveryKey: null,
    remote: null,
    client: null,
    network: null,
  }

  if (null == conf.key || 'string' != typeof conf.key) {
    throw new TypeError("Expecting network key to be a string.")
  }

  try {
    const doc = await secrets.load(conf)
    const { keystore } = doc.public || doc.secret
    Object.assign(keys, secrets.decrypt({keystore}, {key: conf.key}))
  } catch (err) {
    debug(err)
    throw new Error(`Unable to read keystore for '${conf.key}'.`)
  }

  Object.assign(conf, {discoveryKey: keys.discoveryKey})
  Object.assign(conf, {
    network: keys.network,
    client: keys.client,
    remote: keys.remote,
  })

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
    if (err && 'EADDRINUSE' == err.code) { server.listen(0, onlisten) }
  })
  return true


  function onlisten() {
    const { port } = server.address()
    info('identity-resolver: Server listening on port %s', port)
    announce()
  }

  function announce() {
    clearTimeout(announcementTimeout)
    const { port } = server.address()
    info("identity-resolver: Announcing %s on port %s", conf.discoveryKey.toString('hex'), port)
    channel.join(conf.discoveryKey, port)
  }

  function put(did, cfs) {
    if (did && did.identifier && cfs && cfs.discoveryKey) {
      lookup[did.identifier] = cfs
      lookup[cfs.discoveryKey.toString('hex')] = cfs
    }
  }

  function del(did, cfs) {
    if (did && did.identifier) {
      delete lookup[did.identifier]
    }

    if (cfs && cfs.discoveryKey) {
      delete lookup[cfs.discoveryKey.toString('hex')]
    }

    if (cfs) {
      cfs.close()
    }
  }

  function get(did) {
    return did && did.identifier ? lookup[did.identifier] : null
  }

  function has(did) {
    return did && did.identifier in lookup
  }

  async function onidentifier(req, res, next) {
    let closed = false
    let did = null

    try {
      did = parseDID(req.params[0])
      debug("onidentifier:", did.reference)

      if ('ara' != did.method) {
        debug(`${did.method} method is not implemented`)
        return notImplemented()
      }

      if (did.identifier in lookup) {
        return await onconnection()
      }

      const key = Buffer.from(did.identifier, 'hex')
      const id = key.toString('hex')

      // @TODO(jwerle): Cache on disk, instead of always using RAM
      const ttl = 1000 * 60 // in milliseconds
      const cfs = await createCFS({ key, id, shallow: true, storage: ram }) // @TODO(jwerle): Figure out an on-disk cache
      const timeout = setTimeout(ontimeout , kRequestTimeout)

      put(did, cfs)

      cfs.discovery = createServer({stream: () => cfs.replicate()})
      cfs.discovery.once('connection', () => setTimeout(onexpire, ttl))
      cfs.discovery.once('connection', () => clearTimeout(timeout))
      cfs.discovery.once('connection', onconnection)
      cfs.discovery.join(cfs.discoveryKey)

      req.once('close', onclose)
      req.once('end', onclose)

      async function onexpire() {
        if (false == closed) { setTimeout(onexpire, ttl) }
        else { del(did, get(did)) }
      }

    } catch (err) {
      debug(err)
      warn("error:", err.message)
    }

    function notImplemented() {
      if (false == closed) {
        return res.status(503).end()
      }
    }

    function notFound() {
      if (false == closed) {
        return res.status(404).end()
      }
    }

    function internalError() {
      if (false == closed) {
        return res.status(500).end()
      }
    }

    async function onconnection() {
      info("%s: onconnection", did.identifier)
      if (false == has(did)) { return }
      const cfs = get(did)

      try {
        const timeout = setTimeout(notFound, kRequestTimeout)
        const buffer = await cfs.readFile('ddo.json')
        clearTimeout(timeout)
        if (false == closed) {
          res.set('content-type', 'application/json')
          res.send(buffer)
        }
        info("%s: ddo.json ", did.identifier)
      } catch (err) {
        debug(err)
        internalError()
      } finally {
        return onclose()
      }
    }

    async function ontimeout() {
      del(did, get(did))
      onclose()
      return notFound()
    }

    async function onclose() {
      if (false == closed) {
        closed = true
        const cfs = get(did)
        if (cfs && cfs.discovery) {
          cfs.discovery.destroy()
          cfs.discovery = null
        }
      }
    }
  }
}

async function stop (argv) {
  if (server == null) { return false }

  warn('identity-resolver: Stopping the server!!')
  server.close()
  return true
  function onclose () {
    server = null
  }
}

module.exports = {
  getInstance,
  configure,
  start,
  stop
}
