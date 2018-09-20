<img src="https://github.com/AraBlocks/docs/blob/master/ara.png" width="30" height="30" />
Ara Identity Resolver
=====================

[![Build Status](https://travis-ci.com/AraBlocks/ara-identity-resolver.svg?token=Ty4yTmKT8aELetQd1xZp&branch=master)](https://travis-ci.com/AraBlocks/ara-identity-resolver)
==============================

**Ara Universal Resolver** is a universal resolver implementation that
providers a driver for the `did:ara:` method.

## Installation

```sh
$ npm install arablocks/ara-identity-resolver
```

## Usage

### Starting with `ann`

The resolver can be started with the
[ann](https://github.com/arablocks/ara-network#ara-network-node1)
command line tool.

```sh
$ ann -t ara-identity-resolver \
  --secret 'SHARED_SECRET' \
  --keyring 'path/to/keyring' \
  --network resolver.my.network
```

Try `ann -t ara-identity-resolver --help` if you run into any issues.
See _Runtime Configuration_ below for more configuration options. See
_Generating Network Keys_ to generate keys for this resolver.

### Programmtic usage

**Ara Identity Resolver** implements [ARA RFC
0002](https://github.com/AraBlocks/rfcs/blob/master/text/0002-ann.md)
enabling programmatic usage of the node.

```js
const {
  getInstance,
  configure,
  start,
  stop
} = require('ara-identity-resolver')

start()
  .then(getInstance)
  .then((node) => node.on('error', console.error))
  .catch(console.error)
```

### HTTP Server Routes

This section describes the public HTTP routes implemented in server. If
the route is not defined, the server will return a `404`. If the route
is known, but lacking implementation, the server will return a `503`.
Identifiers that can be correctly resolved return a `200`. Internal
server errors will return a `500` and resolution times will return a
`408`.

#### `GET /1.0/identifiers/:did`

This route matches version 1.0 DID identifiers.

##### DID Method Actions

This secion describes the DID methods implemented by this node.

##### `did:ara:<identifier>`

The `ara` DID method resolves a DDO document for a DID if resolution is
successful. The node will persist a local cache that it will check
before asking the network or local file system. Cached documents can
expire based on a configured TTL.

### Runtime Configuration

**Ara Identity Resolver** makes use of various [runtime
configuration](https://github.com/AraBlocks/ara-runtime-configuration)
to configure how the node runs. They are documented in this section.

#### `network.identity.resolver`

Configuration related to the server running in this node.

##### `network.identity.resolver.timeout`

The time in milliseconds before a HTTP request times out the response.

**Default:** `5000`

##### `network.identity.resolver.port`

The server port to listen to incoming HTTP requests on.

**Default:** `8000`

##### `network.identity.resolver.cache`

Configuration related to the document cache database.

##### `network.identity.resolver.cache.nodes[]`

An array of existing nodes to share cache lookups with. Each entry
should be a valid **Ara Identity** URI or identifier.

**Default:** `[]`

##### `network.identity.resolver.cache.ttl`

The time in milliseconds a cached entry should be valid for.

**Default:** `10000`

##### `network.identity.resolver.cache.data`

Configuration related to the document cache database data store.

##### `network.identity.resolver.cache.data.root`

The path to the data root of the document cache database data store.

**Default:** `~/.ara/identities/cache`

### Generating Network Keys

The **Ara Identity Resolver** runs bound to an identity and a set of
[network
keys](https://github.com/AraBlocks/rfcs/blob/master/text/0003-ank.md)
that live in a [network
keyring](https://github.com/AraBlocks/ara-network/blob/master/keyring.js).
Before you can start a network node, you'll need an identity and network
keys for it.

**Creating an identity:**

```sh
$ aid create # password is 'hello'
```

The identity created gave us this did
`did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754`
which is what we'll need to create keys and a keyring next.

Keys and a keyring can be created with
[ank](https://github.com/arablocks/ara-network#ara-network-keys1). The
keyring is _append only_ so you can keep writing to it, even if it
already exists.

To use the node, a network name and secret must be created. The network
name will be used in the node and the secret is token that gives the
node access to the keyring.

**Creating network keys:**

```sh
$ ank --network my.resolver.net \
    --identity did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754 \
    --keyring ./keyring \
    --secret 'SECRET'
```

This just created network keys for a network named `my.resolver.net`
secured in the `./keyring` file. `keyring.pub` should also exist. The
keyring and the keys are bound to the given identity. You should have
been prompted for your password. Your password unlocked your secret key
which was used to secure your keyring. `keyring.pub` is actually the
shared or _public_ version of the keyring which can be delegated to
other interested partities.

## See Also

* [ara-network](https://github.com/arablocks/ara-network)
* [ara-idenity](https://github.com/AraBlocks/ara-identity)
* [ann](https://github.com/arablocks/ara-network#ara-network-node1)

## License

LGPL-3.0
