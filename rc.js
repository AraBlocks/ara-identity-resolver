/* eslint-disable global-require */
const extend = require('extend')
const rc = require('ara-runtime-configuration')

const defaults = () => ({
  network: {
    identity: {
      resolver: {
        http: {
          port: 8000
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