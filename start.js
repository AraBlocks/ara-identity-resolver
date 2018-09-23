const { hasInstance, setInstance } = require('./instance')
const { info, warn } = require('ara-console')('identity-resolver')
const { Resolver } = require('./lib/resolver')
const inquirer = require('inquirer')
const debug = require('debug')('ara:identity:resolver:start')
const conf = require('./conf')

/**
 * The start function initializes and starts the
 * identity resolver network resolver service.
 * @public
 * @param {Object} argv
 * @return {Boolean}
 */
async function start(argv) {
  if (hasInstance()) {
    return false
  }

  conf.password = await resolvePassword(argv)
  const resolver = new Resolver(conf)

  resolver.once('ready', () => info('resolver ready'))
  resolver.once('start', () => info('resolver started'))

  info('Starting')
  await resolver.start()

  const { address, port } = resolver.server.address()
  info('Listening on http://%s:%d', address, port)

  debug('setting instance')
  await setInstance(resolver)

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
      'Please enter the passphrase associated with the resolver identity.\n' +
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
