<img src="https://github.com/AraBlocks/docs/blob/master/ara.png" width="30" height="30" /> ara-network-node-identity-resolver
======================================

[![Build Status](https://travis-ci.com/AraBlocks/ara-network-node-identity-resolver.svg?token=Ty4yTmKT8aELetQd1xZp&branch=master)](https://travis-ci.com/AraBlocks/ara-network-node-identity-resolver)
==================================

An ARA network node that resolves an identifier to its corresponding keystore

## Installation

```sh
$ npm install ara-identity ara-network ara-network-node-identity-resolver
```

## Usage

### Runtime Configuration

TODO


### Prerequisite

* All Ara network nodes require an ARA ID & a shared network key to be generated. Please refer to [ara-network](https://github.com/AraBlocks/ara-network)'s [ANK CLI](https://github.com/AraBlocks/ara-network/blob/master/bin/ara-network-keys) & [ara-identity](https://github.com/AraBlocks/ara-identity)'s [AID CLI](https://github.com/AraBlocks/ara-identity/blob/master/bin/ara-identity)


### Programmatic

[interface]: https://github.com/AraBlocks/ara-network/blob/master/README.md

The `ara-network-node-identity-resolver` module can be used programmatically as it
conforms to the [`ara-network` node interface][interface].

```js
const identityResolver = require('ara-network-node-identity-resolver')
const rc = require('ara-runtime-configuration')
const program = require('yargs')
const { argv } = program

void async function main() {
  try { await identityResolver.configure(rc.network.node.identity.resolver, program) }
  catch (err) {
    await identityResolver.configure({
      identity: DID,
      secret: 'shared-secret-string',
      name: 'keyring-name-entry',
      keyring: 'path-to-keyring-public-file',
    },
    program)
  }
  await identityResolver.start(argv)
}()
```

### Command Line (ann)

With the `ann` (or `ara-network-node`) command line interface, you can
invoke this network node by running the following:

```sh
$ ann -t ara-network-node-identity-resolver -i <DID> \
           -s <shared-secret-string> \
           -n <keyring-name-entry> \
           -k <path-to-keyring-public-file>
```

To see usage help about this network node interface, run the following:

```sh
$ ann -t ara-network-node-identity-resolver --help
```

## See Also

* [ara-network](https://github.com/arablocks/ara-network)
* [ara-idenity](https://github.com/AraBlocks/ara-identity)

## License

LGPL-3.0
