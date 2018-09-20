const jitson = require('jitson')

const MAX_PARSE_ATTEMPTS = 5

function createParser(json) {
  if ('function' === typeof json) {
    // eslint-disable-next-line new-cap
    json = new json()
  }

  if ('object' === typeof json) {
    json = JSON.stringify(json)
  }

  const parse = jitson({ sampleInterval: 1 })
  let attempts = 0

  if ('string' === typeof json) {
    while (!parse.schema && attempts++ < MAX_PARSE_ATTEMPTS) {
      parse(json)
    }
  }

  return parse
}

module.exports = {
  createParser
}
