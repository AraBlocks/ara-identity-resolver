const { getInstance, setInstance } = require('./instance')
const { warn } = require('ara-console')('identity-resolver')

async function stop() {
  const node = await getInstance()

  warn('Stopping identity resolver network node.')
  await node.close()
  warn('Stopped')
  setInstance(null)
  return true
}

module.exports = {
  stop
}
