const { ResolutionError, ResolutionResult } = require('did-universal-resolver-resolution')
const { info, warn, error } = require('ara-console')
const { parse: parseDID } = require('did-uri')
const { createCFS } = require('cfsnet/create')
const { sync } = require('ara-identity-archiver')
const debug = require('debug')('did-resolver')
const http = require('http')

let server

/**
 * Pass DID URI in, get identity out
 *
 * @return {json}       DDO document
 */

async function start (argv) {
  info(`Starting resolver on port ${argv.port}`)
  server = http.createServer().listen(argv.port)

  server.on('request', async ({ method, url }, response) => {
    if (url.includes('/1.0/identifiers/') && method === 'GET') {
      const urlSplit = url.split('/').slice(3).join('/')
      const did = parseDID(urlSplit)

      if ('ara' != did.method) {
        debug('encountered non-ARA method')
        const err = new ResolutionError(`${did.method} method is not implemented`)
        return next(err)
      }

      const publicKey = did.identifier

      const cfs = createCFS({ key: publicKey })

      try {
        await sync.connect({ onidentifier, onstream, onkey })
      } catch (e) {
        error('Error while syncing: ', e)
        return
      }

      function onidentifier(connection, info) {
        return cfs.identifier
      }

      function onstream(connection, info) {
        return cfs.replicate({ upload: false, download: true })
      }

      function onkey(connection, info) {
        return cfs.key
      }

      cfs.on('update', async () => {
        const ddo = await cfs.readFile('ddo.json')

        if (!ddo) {
          return res.status(404).end()
        }

        const result = new ResolutionResult()
        result.didReference = did
        result.didDocument = ddo

        return res.json(result.toJSON())
      })
    }
  })
  return true
}

async function stop (argv) {
  server.close()
  return true
}

async function configure (opts, program) {
  if (program) {
    const { argv } = program
      .option('port', {
        alias: 'p',
        type: 'number',
        describe: 'Port to listen on',
        default: 3000
      })

    if (argv.port) { opts.port = argv.port }
  }

  return opts
}

async function getInstance (argv) {
  return server
}

module.exports = {
  getInstance,
  configure,
  start,
  stop,
}
