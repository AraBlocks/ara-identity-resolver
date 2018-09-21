const { hasInstance, setInstance } = require('./instance')
const { ResolverNetworkNode } = require('./lib/node')
const { info, warn } = require('ara-console')('identity-resolver')
const inquirer = require('inquirer')
const debug = require('debug')('ara:identity:resolver:start')
const conf = require('./conf')

/**
 * The start function initializes and starts the
 * identity resolver network node service.
 * @public
 * @param {Object} argv
 * @return {Boolean}
 */
async function start(argv) {
  if (hasInstance()) {
    return false
  }

  conf.password = await resolvePassword(argv)
  const node = new ResolverNetworkNode(conf)

  node.once('ready', () => info('Node ready'))
  node.once('start', () => info('Node started'))

  info('Starting')
  await node.start()

  const { address, port } = node.server.address()
  info('Listening on http://%s:%d', address, port)

  debug('setting instance')
  await setInstance(node)

  return true
}

/**
 * Resolves a password from the command line, otherwise it
 * will prompt a user for one blocking until the enter key
 * is pressed.
 * @private
 * @param {Object} argv
 * @return {String}
 */
async function resolvePassword(argv) {
  let { password } = argv

  debug('resolving password')

  if (password) {
    warn('Accepting password from command line (--password).')
  } else {
    const res = await inquirer.prompt([ {
      type: 'password',
      name: 'password',
      message:
      'Please enter the passphrase associated with the node identity.\n' +
      'Passphrase:'
    } ])

    // eslint-disable-next-line
    password = res.password
  }

  if (!password) {
    throw new Error('Password not given.')
  }

  return password
}

module.exports = {
  start
}
