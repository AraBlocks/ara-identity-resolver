const rc = require('./rc')()

const conf = exports
const get = k => conf[k]
const set = (k, v) => {
  try {
    conf[k] = JSON.parse(v)
  } catch (err) {
    conf[k] = v
  }
}

set('set', set)
set('get', get)

// cache TTL in milliseconds
set('cache-ttl', rc.network.identity.resolver.cache.ttl)

// path to cache data directory
set('cache-root', rc.network.identity.resolver.cache.data.root)

// an array of public keys for hyperdb cache nodes
set('cache-nodes', rc.network.identity.resolver.cache.nodes || [])

// http request timeout in milliseconds
set('timeout', rc.network.identity.resolver.timeout)

// address for http server to listen on (default: 0.0.0.0)
set('address', rc.network.identity.resolver.address)

// http server port to listen on
set('port', rc.network.identity.resolver.port)
