/* eslint-disable global-require */
const { resolve } = require('path')
const extend = require('extend')
const rc = require('ara-runtime-configuration')

const defaults = () => ({
  network: {
    identity: {
      resolver: {
        timeout: 2 * 1000,
        address: '0.0.0.0',
        port: 8000,

        cache: {
          nodes: [],
          ttl: 30 * 1000,
          data: {
            root: resolve(rc().data.root, 'identities', 'cache')
          }
        }
      }
    }
  }
})

module.exports = conf => rc(extend(
  true,
  {},
  require('ara-identity/rc')(),
  require('ara-network/rc')(),
  defaults(),
  conf
))
