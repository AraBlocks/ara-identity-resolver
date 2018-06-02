'use strict'

const { info, warn, error } = require('ara-console')
const { parse: parseDID } = require('did-uri')
const { createServer } = require('ara-network/discovery')
const { createCFS } = require('cfsnet/create')
const express = require('express')
const extend = require('extend')
const debug = require('debug')('ara:network:node:identity-resolver')
const pump = require('pump')
const ram = require('random-access-memory')
const fs = require('fs')

const kRequestTimeout = 2000 // in milliseconds

const conf = {
  port: 8000
}

let server = null

async function getInstance (argv) {
  return server
}

async function configure (opts, program) {
  if (program) {
    const { argv } = program
      .option('port', {
        alias: 'p',
        type: 'number',
        describe: 'Port to listen on',
        default: conf.port
      })

    if (argv.port) { opts.port = argv.port }
  }

  return extend(true, conf, opts)
}

async function start (argv) {
  const lookup = {}
  const app = express()

  server = app.listen(argv.port)
  app.get('/1.0/identifiers/*?', onidentifier)
  info('identity-resolver: Server listening on port %s', conf.port)

  return true

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
  }

  function get(did) {
    return did && did.identifier ? lookup[did.identifier] : null
  }

  async function onidentifier(req, res, next) {
    const did = parseDID(req.params[0])
    debug("onidentifier:", did.reference)

    if ('ara' != did.method) {
      debug(`${did.method} method is not implemented`)
      return res.status(503).end()
    }

    let discovery = null
    let closed = false

    const key = Buffer.from(did.identifier, 'hex')
    const id = key.toString('hex')

    req.once('close', onclose)
    req.once('end', onclose)

    if (did.identifier in lookup) { await onconnection() }
    else {
      const ttl = 1000 * 5 // in milliseconds
      const cfs = await createCFS({ key, id, storage: ram })
      const timeout = setTimeout(ontimeout , kRequestTimeout)
      discovery = createServer({stream: () => cfs.replicate()})

      put(did, cfs)

      discovery.join(cfs.discoveryKey)
      discovery.once('connection', () => setTimeout(onexpire, ttl))
      discovery.once('connection', () => clearTimeout(timeout))
      discovery.once('connection', onconnection)

      async function onexpire() {
        if (false == closed) { setTimeout(onexpire, ttl) }
        else {
          const cfs = get(did)
          del(did, cfs)
        }
      }
    }

    async function onconnection() {
      const cfs = lookup[did.identifier]

      try {
        res.set('content-type', 'application/json')
        res.send(await cfs.readFile('ddo.json'))
      } catch (err) {
        debug(err)
        res.status(500).end()
      } finally {
        return onclose()
      }
    }

    async function ontimeout() {
      const cfs = lookup[did.identifier]
      del(did, cfs)
      onclose()
      res.status(404).end()
    }

    async function onclose() {
      if (false == closed) {
        closed = true
        if (discovery) {
          discovery.destroy()
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
