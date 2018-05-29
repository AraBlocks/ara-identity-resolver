'use strict'

const debug = require('debug')('ara:network:node:identity-resolver')
const { info, warn, error } = require('ara-console')
const extend = require('extend')
const did = require('did-uri')
const http = require('http')

const conf = {
  port: 3000
}

let server = null

async function start (argv) {
  if (server) {
    return false
  }
  server = http.createServer().listen(conf.port)
  server.on('request', (request, response) => {
    if (request.method === 'GET' && request.url.indexOf('/1.0/identifiers/') > -1) {
      try {
        let didResolver = {}
        didResolver['didReference'] = did.parse(request.url.split('/')[3])
        didResolver['didDocument'] = {}
        didResolver['methodMetadata'] = {}
        didResolver['resolverMetadata'] = {}
        request.on('data', (didResolver) => {
            body.push(didResolver)
          }).on('end', () => {
            response.statusCode = 200
            response.end(JSON.stringify(didResolver))
          })
      }
      catch(err) {
        response.statusCode = 404
        response.end(err.toString())
      }
    } else {
      response.statusCode = 404
      response.end('Invalid request method specified')
    }
  })
  server.on('error', (err, request, response) => {
    response.statusCode = 503
    response.end(err)
  })
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
        default: conf.ports
      })

    if (argv.port) { opts.port = argv.port }
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
