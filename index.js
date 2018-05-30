'use strict'

const fs = require('fs')
const pify = require('pify')
const http = require('http')
const extend = require('extend')
const express = require('express')
const ram = require('random-access-memory')
const archiver = require('ara-identity-archiver/sync')
const debug = require('debug')('ara:network:node:identity-resolver')
const { discoveryKey: createDiscoveryKey } = require('ara-crypto')
const secrets = require('ara-network/secrets')
const { info, warn, error } = require('ara-console')
const { parse: parseDID } = require('did-uri')
const { createCFS } = require('cfsnet/create')

const app = express()
const conf = {
  key: null,
  keystore: null,
  port: 8000
}

let server = null

async function start (argv) {

  const { keystore } = JSON.parse(await pify(fs.readFile)(argv.keystore))
  let opt = {
    key: Buffer.alloc(16).fill(conf.key),
    keystore: keystore
  }

  const { network } = await archiver.connect(opt)
  network.swarm.on('connection', (connection, peer)=>{
    connection.on('error', (err)=>{
      debug(err)
      warn(err.message)
    })

  })
  network.swarm.on('error', (err)=> {
    debug(err)
    warn(err.message)
  })

  app.get('/1.0/identifiers/*?', async (req, res, next) => {
    const did = parseDID(req.params[0])

    //Object.assign(opt, { onidentifier, onstream, onkey })
    if ('ara' != did.method) {
      debug('encountered non-ARA method')
      debug(`${did.method} method is not implemented`)
      return next(`${did.method} method is not implemented`)
    }

    const publicKey = Buffer.from(did.identifier,'hex')
    const cfs = await createCFS({
      key: publicKey,
      id: did.identifier,
      storage: ram,
      sparse: true
    })
    network.swarm.join(cfs.discoveryKey)
    cfs.once('update', async () => {
      console.log("Updating CFS")
      cfs.readFile('ddo.json','utf8').then(async (ddo)=>{
        console.log("Resolving DDO")

        if (!ddo) {
          res.status(404).end()
          }
        else{
          res.send(JSON.stringify({
              didReference: did,
              didDocument: JSON.parse(ddo),
              methodMetadata: {},
              resolverMetadata: {}
            }))
          }
        await cfs.close()
      })
      .catch((err)=>{
        console.log(err)
      })
    })

    console.log("Connection made")
    function onidentifier(connection, info) {
      console.log("Identifier")
      return cfs.identifier
    }

    function onstream(connection, info) {
      console.log("On stream ")
      return cfs.replicate({ upload: false, download: true })
    }

    function onkey(connection, info) {
      console.log("ON key")
      return cfs.key
    }
  })
  server = app.listen(argv.port)
  info('identity-resolver: Server listening on port %s',conf.port)
  return true
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
