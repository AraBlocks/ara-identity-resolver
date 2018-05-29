ara-network-node-identity-resolver
==================================

An ARA network node that resolves an identifier to its corresponding keystore

## Installation

```sh
$ npm install ara-network ara-network-node-identity-resolver
```

## Usage

### Runtime Configuration

[rc]: https://github.com/arablocks/ara-runtime-configuration

[Runtime configuration][rc] can be specified by targeting the
`[network.node.identity-resolver]` _INI_ section or the nested _JSON_ object
`{ network: { node: { 'identity-resolver': { ... }}}`. For clarity, we detail the
options below in _INI_ format.

```ini
[network.node.identity-resolver]
;; @TODO
```

### Programmatic

[interface]: https://github.com/AraBlocks/ara-network/blob/master/nodes/README.md

The `ara-network-node-identity-resolver` module can be used programmatically as it
conforms to the [`ara-network` node interface][interface].

```js
const { argv } = require('yargs')
const identity-resolver = require('ara-network-node-identity-resolver')
const rc = require('ara-runtime-configuration')

void async function main() {
  try { await identity-resolver.configure(rc.network.node.identity-resolver, require('yargs')) }
  catch (err) { await identity-resolver.configure(null, require('yargs')) }
  await identity-resolver.start(argv)
}()
```

### Command Line (ann)

With the `ann` (or `ara-network-node`) command line interface, you can
invoke this network node by running the following:

```sh
$ ann --type identity-resolver
```

To see usage help about this network node interface, run the following:

```sh
$ ann --type identity-resolver --help
```

## See Also

* [ara-network](https://github.com/arablocks/ara-network)

## License

LGPL-3.0
