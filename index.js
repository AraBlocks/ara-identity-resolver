'use strict'

const { info, warn, error } = require('ara-console')
const extend = require('extend')
const debug = require('debug')('ara:network:node:identity-resolver')
const dns = require('ara-network/dns')

const conf = {
}

let server = null

async function start(argv) {
  if (server) { return false }

  server = dns.createServer(conf)

  server.on('error', onerror)
  server.on('close', onclose)
  server.on('listening', onlistening)

  return true

  function onerror(err) {
    warn("identity-resolver: error:", err.message)
    debug("error:", err)
  }

  function onclose() {
    warn("identity-resolver: Closed")
  }

  function onlistening() {
    const { port } = server.address()
    info("identity-resolver: Listening on port %s", port)
  }
}

async function stop(argv) {
  if (null == server) { return false }
  warn("identity-resolver: Stopping server")
  server.close(onclose)
  return true
  function onclose() {
    server = null
  }
}

async function configure(opts, program) {
  if (program) {
    const { argv } = program
    if (argv.port) {
      opts.port = argv.port
    }
  }
  return extend(true, conf, opts)
}

async function getInstance(argv) {
  return server
}

module.exports = {
  getInstance,
  configure,
  start,
  stop,
}
