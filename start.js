const { ResolverNetworkNode } = require('./lib/node')
const { setInstance } = require('./instance')
const { info, warn } = require('ara-console')('identity-resolver')
const inquirer = require('inquirer')
const debug = require('debug')('ara:identity:resolver:start')
const conf = require('./conf')

const STARTING = 1
const STARTED = 2
const BUSY = STARTING | STARTED
let status = 0

/**
 * The start function initializes and starts the
 * identity resolver network node service.
 * @public
 * @param {Object} argv
 * @return {Boolean}
 */
async function start(argv) {
  if (BUSY === status & BUSY) {
    return false
  }

  debug('status |= STARTING')
  info('Starting')
  status |= STARTING

  conf.password = await resolvePassword(argv)
  const node = new ResolverNetworkNode(conf)

  info('Initializing')
  await node.ready()
  info('Ready')

  const { address, port } = node.server.address()
  info('Listening on http://%s:%d', address, port)

  await setInstance(node)

  debug('status |= STARTED')
  status |= STARTED
  info('Started')

  // reset status when node closes
  node.once('close', () => { status = 0 })

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
