const toBuffer = require('to-buffer')
const thunky = require('thunky')
const Batch = require('batch')
const pify = require('pify')

/**
 * Convert any input to a hex string
 * @public
 * @param {String|Buffer|Mixed} input
 * @return {String}
 */
function toHex(input) {
  try {
    return toBuffer(input).toString('hex')
  } catch (err) {
    void err
    return null !== input && undefined !== input ? toHex(String(input)) : ''
  }
}

/**
 * Returns input function if input is a function, otherwise
 * an identity function is returned.
 * @public
 * @param {...Function} callbacks
 * @return {Function}
 */
function callback(...callbacks) {
  return (...args) => callbacks
    .filter(cb => 'function' === typeof cb)
    .map(cb => cb(...args))
}

/**
 * Set value for an object at a given pathspec (a.b.c = value).
 * @public
 * @param {Object} object
 * @param {String} pathspec
 * @param {Mixed} value
 * @return {Mixed}
 */
function pathset(object, pathspec, value) {
  const paths = pathspec.split('.')
  return paths.reduce(reduce, object)

  function reduce(ctx, key, i) {
    return assign(ctx, key, i === paths.length - 1)
  }

  function assign(ctx, key, last) {
    if (last) {
      ctx[key] = value
      return value
    } else if (ctx && ('object' === typeof ctx || 'function' === typeof ctx)) {
      return ctx
    }

    return {}
  }
}

/**
 * Forwards all events from a given source EventEmitter to
 * a given target EventEmitter.
 * @public
 * @param {EventEmitter} source
 * @param {EventEmitter} target
 * @param {Array<String>} events
 */
function forwardEvents(source, target, events) {
  return events.map(forward)

  function forward(event) {
    if (source && 'function' === typeof source.on) {
      source.on(event, onevent)
    }

    function onevent(...args) {
      target.emit(event, ...args)
    }
  }
}

/**
 * Quick and cheap queue constructor based on Batch.
 * @public
 * @param {?(Number)} [concurrency = 1]
 * @return {Batch}
 */
function queue(concurrency) {
  const batch = new Batch()
  batch.concurrency(concurrency || 1)
  return pify(batch)
}

/**
 * Promise based thunky wrapper.
 * @public
 * @param {Function} onready
 * @return {Function}
 */
function readyify(onready) {
  return pify(thunky(onready))
}

module.exports = {
  forwardEvents,
  readyify,
  callback,
  pathset,
  queue,
  toHex,
}
