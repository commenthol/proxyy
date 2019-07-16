const zlib = require('zlib')
const Through = require('streamss-through')

/**
 *
 */
const unzip = () => {
  const stream = new Through(function (data) { this.push(data) })

  const unzipStream = zlib.createUnzip()

  stream.on('pipe', function (src) {
    src.pipe(unzipStream)
  })

  stream.pipe = function pipe (dest) {
    unzipStream.on('error', err => {
      if (err && err.code === 'Z_BUF_ERROR') {
        // unexpected end of file is ignored by browsers and curl
        dest.emit('end')
        return
      }
      dest.emit('error', err)
    })

    return unzipStream.pipe(dest)
  }

  return stream
}

// Check whether response has a non-0-sized gzip-encoded body
const shouldUnzip = (res) => {
  if (res.statusCode === 204 || res.statusCode === 304) {
    // These aren't supposed to have any body
    return false
  }

  // header content is a string, and distinction between 0 and no information is crucial
  if (res.headers['content-length'] === '0') {
    // We know that the body is empty (unfortunately, this check does not cover chunked encoding)
    return false
  }

  // console.log(res);
  return /^\s*(?:deflate|gzip)\s*$/.test(res.headers['content-encoding'])
}

module.exports = {
  unzip,
  shouldUnzip
}
