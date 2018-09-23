const { getInstance } = require('./instance')
const { configure } = require('./configure')
const { Resolver } = require('./lib/resolver')
const { start } = require('./start')
const { stop } = require('./stop')

module.exports = {
  getInstance,
  configure,
  Resolver,
  start,
  stop,
}
