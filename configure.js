const { warn } = require('ara-console')('identity-resolver')
const coalesce = require('defined')
const conf = require('./conf')
const pkg = require('./package.json')
const rc = require('./rc')()

async function configure(opts, program) {
  let argv = {}
  if (program) {
    program
      .wrap(null)
      .version('version', 'Show version number', pkg.version)
      .group([ 'identity', 'secret', 'keyring', 'network' ], 'Network Options:')
      .option('identity', {
        alias: 'i',
        requiresArg: true,
        required: true,
        default:
          rc.network.identity.resolver.whoami ||
          rc.network.identity.whoami ||
          rc.network.whoami,

        defaultDescription: (
          rc.network.identity.whoami
            ? `${rc.network.identity.whoami.slice(0, 16)}...`
            : undefined
        ),

        describe:
`A valid, local, and resolvable Ara identity DID
URI of the owner of the given keyring. You will be
prompted for the associated passphrase`,
      })
      .option('secret', {
        alias: 's',
        describe: 'Shared secret key for the associated network keys',
        required: true,
        requiresArg: true,
        default:
          rc.network.identity.resolver.secret ||
          rc.network.identity.secret ||
          rc.network.secret,
      })
      .option('keyring', {
        alias: 'k',
        describe: 'Path to Ara network keyring file',
        required: true,
        requiresArg: true,
        default:
          rc.network.identity.resolver.keyring ||
          rc.network.identity.keyring ||
          rc.network.keyring,
      })
      .option('network', {
        alias: 'n',
        describe: 'Human readable network name for keys in keyring',
        required: true,
        requiresArg: true,
        default: rc.network.identity.resolver.network
      })

    program.group([
      'port', 'address', 'timeout',
      'cache-ttl', 'cache-root', 'cache-node',
    ], 'Server Options:')
      .option('port', {
        type: 'number',
        alias: 'p',
        default: conf.port,
        describe: 'Port for network node to listen on.',
      })
      .option('address', {
        type: 'string',
        default: conf.address,
        describe: 'Network address to listen on',
      })
      .option('timeout', {
        type: 'number',
        default: conf.timeout,
        describe: 'Request timeout (in milliseconds)',
        requiresArg: true,
      })
      .option('cache-ttl', {
        type: 'number',
        describe: 'Max age for entries in cache',
        default: conf['cache-ttl']
      })
      .option('cache-root', {
        type: 'string',
        default: conf['cache-root'],
        describe: 'Path to cache data root',
        requiresArg: true,
      })
      .option('cache-node', {
        type: 'string',
        default: conf['cache-nodes'],
        describe: 'Another resolver node public key to share cache with',
        requiresArg: true,
      })

    // eslint-disable-next-line prefer-destructuring
    argv = program.argv
  }

  if (argv.identity && 0 !== argv.identity.indexOf('did:ara:')) {
    argv.identity = `did:ara:${argv.identity}`
  }

  conf.port = select('port', argv, opts, conf)
  conf.secret = select('secret', argv, opts, conf)
  conf.keyring = select('keyring', argv, opts, conf)
  conf.network = select('network', argv, opts, conf) || argv.name
  conf.identifier = (
    select('identifier', argv, opts, conf) ||
    select('identity', argv, opts, conf)
  )

  if (argv.name && !argv.network) {
    warn('Please use \'--network\' instead of \'--name\'.')
  }

  conf['cache-ttl'] = select('cache-ttl', argv, opts, conf)
  conf['cache-root'] = select('cache-root', argv, opts, conf)

  const nodes = select('cache-node', argv, opts, conf)

  if (Array.isArray(nodes)) {
    conf['cache-nodes'] = nodes
  } else if (nodes) {
    conf['cache-nodes'] = [ nodes ]
  }

  function select(k, ...args) {
    return coalesce(...args.map(o => o[k]))
  }
}

module.exports = {
  configure
}
