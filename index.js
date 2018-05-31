'use strict'

const fs = require('fs')
const pify = require('pify')
const http = require('http')
const extend = require('extend')
const express = require('express')
const through = require('through2')
const ram = require('random-access-memory')
const debug = require('debug')('ara:network:node:identity-resolver')
const { discoveryKey: createDiscoveryKey } = require('ara-crypto')
const secrets = require('ara-network/secrets')
const { info, warn, error } = require('ara-console')
const { parse: parseDID } = require('did-uri')
const { createCFS } = require('cfsnet/create')

const { createServer } = require('ara-network/discovery')

const app = express()
const conf = {
  key: null,
  keystore: null,
  port: 8000
}

let server = null

async function start (argv) {

  const discovery = createServer({stream})
  const lookup = {}

  server = app.listen(argv.port)
  app.get('/1.0/identifiers/*?', onidentifier)
  info('identity-resolver: Server listening on port %s', conf.port)

  return true

  function stream(peer) {
    console.log('stream', peer);
    if (peer && peer.channel) {
      const discoveryKey = peer.channel.toString('hex')
      if (discoveryKey in lookup) {
        return lookup[discoveryKey].replicate({upload: true, download: true})
      }
    }
    return through()
  }

  async function onidentifier(req, res, next) {
    const did = parseDID(req.params[0])

    if ('ara' != did.method) {
      debug('encountered non-ARA method')
      debug(`${did.method} method is not implemented`)
      return res.status(503).end()
    }

    const key = Buffer.from(did.identifier, 'hex')

    if (false == did.identifier in lookup) {
      const { discoveryKey } = lookup[did.identifier] = await createCFS({key,
        storage: ram,
        //sparse: true,
        id: key,
      })

      lookup[discoveryKey.toString('hex')] = lookup[did.identifier]
      discovery.join(discoveryKey)
    }

    const cfs = lookup[did.identifier]
    cfs.once('update', () => {
      console.log('update');
    })
    try {
      const ddo = await cfs.readFile('ddo.json')
      console.log('ddo', ddo);
    } catch (err) {
      console.log('error', err);
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

async function configure (opts, program) {
  if (program) {
    const { argv } = program
      .option('port', {
        alias: 'p',
        type: 'number',
        describe: 'Port to listen on',
        default: conf.port
      })
      .option('key', {
        alias: 'k',
        type: 'string',
        describe: 'Network Key',
      })
      .option('keystore', {
        alias: 'K',
        type: 'string',
        describe: 'Path to the keystore file',
        default: conf.port
      })

    if (argv.port) { opts.port = argv.port }
    if (argv.keystore) { opts.keystore = argv.keystore}
    if (argv.key) { opts.key = argv.key }
  }
  return extend(true, conf, opts)
}

async function getInstance (argv) {
  return server
}

module.exports = {
  getInstance,
  configure,
  start,
  stop
}
