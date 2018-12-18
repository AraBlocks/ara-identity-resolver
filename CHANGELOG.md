## [0.42.7](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.6...0.42.7) (2018-12-18)


### Bug Fixes

* **lib/drivers/ara.js:** Restore resolution logic ([130aeac](https://github.com/AraBlocks/ara-identity-resolver/commit/130aeac))



## [0.42.6](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.5...0.42.6) (2018-12-18)


### Bug Fixes

* **lib/http.js:** Fix 'ontimeout' calling 'res.end()' for every request ([af1b805](https://github.com/AraBlocks/ara-identity-resolver/commit/af1b805))



## [0.42.5](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.4...0.42.5) (2018-12-13)



## [0.42.4](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.3...0.42.4) (2018-12-13)



## [0.42.3](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.2...0.42.3) (2018-12-12)



## [0.42.2](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.1...0.42.2) (2018-12-10)



## [0.42.1](https://github.com/AraBlocks/ara-identity-resolver/compare/0.42.0...0.42.1) (2018-12-09)



# [0.42.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.41.0...0.42.0) (2018-12-08)


### Bug Fixes

* **lib/drivers/ara.js:** Account for DNS in DID identifier ([36ee8fc](https://github.com/AraBlocks/ara-identity-resolver/commit/36ee8fc))



# [0.41.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.39.0...0.41.0) (2018-12-07)


### Bug Fixes

* **lib/drivers/ara.js:** Catch error to return 'null' for clean response ([c140493](https://github.com/AraBlocks/ara-identity-resolver/commit/c140493))


### Features

* **configure.js:** Cascade property values from ararc for defaults ([a556eb5](https://github.com/AraBlocks/ara-identity-resolver/commit/a556eb5))
* **lib/http.js:** Support '/' for health check route ([f7ef073](https://github.com/AraBlocks/ara-identity-resolver/commit/f7ef073))
* **lib/http.js:** Support CORS headers in responses ([b9b137a](https://github.com/AraBlocks/ara-identity-resolver/commit/b9b137a))



# [0.39.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.37.0...0.39.0) (2018-09-23)


### Features

* **instance.js:** Introduce 'hasInstance()' ([b9e04a7](https://github.com/AraBlocks/ara-identity-resolver/commit/b9e04a7))
* **lib/cache.js:** Introduce 'cache.addPeer' ([528fd0d](https://github.com/AraBlocks/ara-identity-resolver/commit/528fd0d))



# [0.37.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.36.0...0.37.0) (2018-09-20)



# [0.36.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.35.0...0.36.0) (2018-09-20)


### Features

* **{index,rc}.js:** Allow 'cache-ttl' to configured at runtime ([ea9f114](https://github.com/AraBlocks/ara-identity-resolver/commit/ea9f114))



# [0.35.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.34.0...0.35.0) (2018-09-19)



# [0.34.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.33.0...0.34.0) (2018-09-19)



# [0.33.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.32.0...0.33.0) (2018-09-19)



# [0.32.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.31.0...0.32.0) (2018-09-19)



# [0.31.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.30.0...0.31.0) (2018-09-19)



# [0.30.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.29.0...0.30.0) (2018-09-19)



# [0.29.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.28.0...0.29.0) (2018-09-19)



# [0.28.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.27.0...0.28.0) (2018-09-19)



# [0.27.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.26.0...0.27.0) (2018-09-19)



# [0.26.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.25.0...0.26.0) (2018-09-19)



# [0.25.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.24.0...0.25.0) (2018-09-19)



# [0.24.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.23.0...0.24.0) (2018-09-19)



# [0.23.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.22.0...0.23.0) (2018-09-18)



# [0.22.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.21.0...0.22.0) (2018-09-14)


### Features

* **index.js:** Introduce persistent and shared cache ([2e09119](https://github.com/AraBlocks/ara-identity-resolver/commit/2e09119))
* **rc.js:** Introduce 'network.identity.cache.data.root' property ([7a46358](https://github.com/AraBlocks/ara-identity-resolver/commit/7a46358))



# [0.21.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.20.1...0.21.0) (2018-09-13)


### Features

* **index.js:** Introduce turbo speed :rocket: ([3f0340e](https://github.com/AraBlocks/ara-identity-resolver/commit/3f0340e))



## [0.20.1](https://github.com/AraBlocks/ara-identity-resolver/compare/0.20.0...0.20.1) (2018-09-12)


### Bug Fixes

* **index.js:** Fix memory leak in pointer to cfs in 'map' object ([eea00bd](https://github.com/AraBlocks/ara-identity-resolver/commit/eea00bd))



# [0.20.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.19.0...0.20.0) (2018-09-12)



# [0.19.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.18.0...0.19.0) (2018-09-12)



# [0.18.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.17.0...0.18.0) (2018-09-12)



# [0.17.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.16.0...0.17.0) (2018-09-12)



# [0.16.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.15.0...0.16.0) (2018-09-12)



# [0.15.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.14.0...0.15.0) (2018-09-12)



# [0.14.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.13.0...0.14.0) (2018-09-12)



# [0.13.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.12.0...0.13.0) (2018-09-12)



# [0.12.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.11.0...0.12.0) (2018-09-12)



# [0.11.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.10.0...0.11.0) (2018-09-10)



# [0.10.0](https://github.com/AraBlocks/ara-identity-resolver/compare/0.7.0...0.10.0) (2018-08-29)


### Features

* **index.js:** Introduce response caching ([77fab9c](https://github.com/AraBlocks/ara-identity-resolver/commit/77fab9c))



# [0.7.0](https://github.com/AraBlocks/ara-identity-resolver/compare/v0.6.0...0.7.0) (2018-08-23)



# [0.6.0](https://github.com/AraBlocks/ara-identity-resolver/compare/v0.5.0...v0.6.0) (2018-08-22)



# [0.5.0](https://github.com/AraBlocks/ara-identity-resolver/compare/v0.4.0...v0.5.0) (2018-08-22)



# [0.4.0](https://github.com/AraBlocks/ara-identity-resolver/compare/v0.3.0...v0.4.0) (2018-08-22)



# [0.3.0](https://github.com/AraBlocks/ara-identity-resolver/compare/v0.2.1...v0.3.0) (2018-08-22)



## [0.2.1](https://github.com/AraBlocks/ara-identity-resolver/compare/0.1.0...v0.2.1) (2018-08-22)


### Features

* **rc.js:** Introduce runtime configuration ([b09b614](https://github.com/AraBlocks/ara-identity-resolver/commit/b09b614))



# [0.1.0](https://github.com/AraBlocks/ara-identity-resolver/compare/5403555...0.1.0) (2018-08-21)


### Features

* **index.js:** Adding did to ddo resolve implementation ([122aef3](https://github.com/AraBlocks/ara-identity-resolver/commit/122aef3))
* **index.js:** Adding GET handler to the server ([a5c0036](https://github.com/AraBlocks/ara-identity-resolver/commit/a5c0036))
* **index.js:** fix ara-network channel path ([7dbc9f5](https://github.com/AraBlocks/ara-identity-resolver/commit/7dbc9f5))
* **index.js:** Initial implementation ([5403555](https://github.com/AraBlocks/ara-identity-resolver/commit/5403555))
* **index.js:** Updating the GET request handler ([03bbb9a](https://github.com/AraBlocks/ara-identity-resolver/commit/03bbb9a))
* **rc.js:** Add runtime configuration ([63ba599](https://github.com/AraBlocks/ara-identity-resolver/commit/63ba599))



