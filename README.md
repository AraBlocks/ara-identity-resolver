<img src="https://github.com/AraBlocks/docs/blob/master/ara.png" width="30" height="30" /> ara-identity-resolver
=====================

[![Build Status](https://travis-ci.com/AraBlocks/ara-identity-resolver.svg?token=Ty4yTmKT8aELetQd1xZp&branch=master)](https://travis-ci.com/AraBlocks/ara-identity-resolver)
==============================

**Ara Universal Resolver** is a universal resolver implementation that
providers a driver for the `did:ara:` method.

## Status
**Stable**

## Dependencies
- [Node](https://nodejs.org/en/download/)
- ara-identity
- ara-network

## Installation

### Prerequists

#### **Create an identity:**
```sh
$ npm install arablocks/ara-identity --global
$ aid create # password is 'hello'
=> did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754
```

#### **Create network keys:**
```sh
$ npm install arablocks/ara-network --global
$ ank --identity did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754 \
    --network 'my.resolver.network' \
    --keyring './path/to/keyring' \
    --secret 'my_shared_secret'
```

#### Install ara-identity-resolver

```sh
$ npm install arablocks/ara-identity-resolver
```

## Usage

```sh
$ ann -t ara-identity-resolver --help

usage: ann -t ara-identity-resolver [options]

General Options:
  --help, -h     Show help  [boolean]
  --debug, -D    Enable debug output  [boolean]
  --version, -V  Show version number  [boolean]

Configuration Options:
  --type, -t  Node type to start
  --conf, -C  Path to configuration file

Network Options:
  --identity, -i  A valid, local, and resolvable Ara identity DID
                  URI of the owner of the given keyring. You will be
                  prompted for the associated passphrase  [required] [default: did:ara:93fabccb...]
  --secret, -s    Shared secret key for the associated network keys  [required]
  --keyring, -k   Path to Ara network keyring file  [required] [default: "/home/.ara/kerying.pub"]
  --network, -n   Human readable network name for keys in keyring  [required]

Server Options:
  --port, -p    Port for network node to listen on.  [number] [default: 8000]
  --timeout     Request timeout (in milliseconds)  [number] [default: 5000]
  --cache-ttl   Max age for entries in cache  [number] [default: 10000]
  --cache-root  Path to cache data root  [string] [default: "/home/.ara/identities/cache"]
  --cache-node  Another resolver node public key to share cache with  [string] [default: []]
```

A resolver server node can be started with the
[ann](https://github.com/arablocks/ara-network#ara-network-node1)
command line tool.

```sh
$ ann -t ara-identity-resolver \
  --network 'my.resolver.network' \
  --keyring 'path/to/keyring' \
  --secret 'my_shared_secret'
```

See [_Runtime Configuration_](#rc) for more configuration options.
See [_Create Network Keys_](#ank) to create keys for this resolver.

### Programmatic usage

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

<a name="rc"></a>
### Runtime Configuration

**Ara Identity Resolver** uses [Ara runtime
configuration](https://github.com/AraBlocks/ara-runtime-configuration)
to configure how the node runs.

- [`network.identity.resolver`](#resolver)
- [`network.identity.resolver.timeout`](#timeout)
- [`network.identity.resolver.port`](#port)
- [`network.identity.resolver.cache`](#cache)
- [`network.identity.resolver.cache.nodes[]`](#nodes)
- [`network.identity.resolver.cache.ttl`](#ttl)
- [`network.identity.resolver.cache.data`](#data)
- [`network.identity.resolver.cache.data.root`](#root)

<a name="resolver"></a>
#### `network.identity.resolver`

Configuration related to the server running in this node.

<a name="timeout"></a>
##### `network.identity.resolver.timeout`

The time in milliseconds before a HTTP request times out the response.

**Default:** `5000`

<a name="port"></a>
##### `network.identity.resolver.port`

The server port to listen to incoming HTTP requests on.

**Default:** `8000`

<a name="cache"></a>
##### `network.identity.resolver.cache`

Configuration related to the document cache database.

<a name="nodes"></a>
##### `network.identity.resolver.cache.nodes[]`

An array of existing nodes to share cache lookups with. Each entry
should be a valid **Ara Identity** URI or identifier.

**Default:** `[]`

<a name="ttl"></a>
##### `network.identity.resolver.cache.ttl`

The time in milliseconds a cached entry should be valid for.

**Default:** `10000`

<a name="data"></a>
##### `network.identity.resolver.cache.data`

Configuration related to the document cache database data store.
<a name="root"></a>
##### `network.identity.resolver.cache.data.root`

The path to the data root of the document cache database data store.

**Default:** `~/.ara/identities/cache`

<a name="ank"></a>
### Create Network Keys

The **Ara Identity Resolver** runs bound to an identity and a set of
[network
keys](https://github.com/AraBlocks/rfcs/blob/master/text/0003-ank.md)
that live in a [network
keyring](https://github.com/AraBlocks/ara-network/blob/master/keyring.js).
Before you can start a network node, you'll need an identity and network
keys for it.

**Create an identity:**

```sh
$ npm install arablocks/ara-identity --global
$ aid create # password is 'hello'
=> did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754
```

Keys and a keyring can be created with
[ank](https://github.com/arablocks/ara-network#ara-network-keys1). The
keyring is _append only_. It will be created the first time and written
to each additional time `ank` is used.

To use the node, a network name and secret must be created. The network
name will be used in the node and the secret is token that gives the
node access to the keyring.

**Create network keys:**

```sh
$ ank --network my.resolver.net \
    --identity did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754 \
    --keyring ./keyring \
    --secret 'SHARED_SECRET'
```

This just created network keys for a network named `my.resolver.net`
secured in the `./keyring` file. `keyring.pub` should also exist. The
keyring and the keys are bound to the given identity. You should have
been prompted for your password. Your password unlocked your secret key
which was used to secure your keyring. `keyring.pub` is actually the
shared or _public_ version of the keyring which can be delegated to
other interested partities.

### HTTP Server Routes

Public HTTP routes implemented in server.
Undefined routes return `404`.
Known but not implemented routes return `503`.
Correctly resolved identifiers return `200`.
Internalserver errors return `500`.
Resolution timeouts return `408`.

#### `GET /1.0/identifiers/:did`

Matches version 1.0 DID identifiers.

##### Example
```sh
$ curl https://myresolver.com/1.0/identifiers/did:ara:53f126d0380eddd5c15980c7b4a4ccd6245d4b3ae47c3c3eab375f0eef172754
```

##### `did:ara:<identifier>`

This `DID Method Action` resolves a DDO document for a DID if resolution is
successful. The node persists a local cache that is checked
before asking the network or local file system. Cached documents can
expire based on a configured TTL.

### Cache

TODO

#### Swarm

TODO

## See Also

- [ara-network](https://github.com/arablocks/ara-network)
- [ara-idenity](https://github.com/AraBlocks/ara-identity)
- [ann](https://github.com/arablocks/ara-network#ara-network-node1)
- [ank](https://github.com/arablocks/ara-network#ara-network-keys1)
- [W3C Decentralized Identifiers Spec](https://w3c-ccg.github.io/did-spec/)

## License

LGPL-3.0
