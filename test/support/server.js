const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const { parallel } = require('asyncc')
const zlib = require('zlib')

const opts = {
  cert: fs.readFileSync(`${__dirname}/../certs/star.crt`),
  key: fs.readFileSync(`${__dirname}/../certs/star.key`)
}

function server (port, cb) {
  const app = express()

  // bodyParser
  app.use((req, res, next) => {
    const data = []
    req.on('data', (chunk) => data.push(chunk))
    req.on('end', () => {
      req.body = Buffer.concat(data).toString()
      next()
    })
  })

  app.use('/(*/)?status/:status', (req, res, next) => {
    res.statusCode = req.params.status
    let end = true
    switch (req.params.status) {
      case '301': {
        res.setHeader('Location', '/status/200')
        break
      }
      case '302': {
        res.setHeader('Location', '../../status/200')
        break
      }
      case '303': {
        const isSSL = req.connection.encrypted || (req.headers['x-forwarded-proto'] === 'https')
        const redir = isSSL ? 'https://' : 'http://' + req.headers.host + '/status/200'
        res.setHeader('Location', redir)
        break
      }
      default:
        end = false
    }
    if (end) {
      res.end()
    } else {
      next()
    }
  })

  app.use('/*/godot', (req, res, next) => {
    // never calls next()
  })

  app.use('/*/destroy', (req, res, next) => {
    res.destroy()
  })

  app.use('/(*/)?cookie', (req, res, next) => {
    res.setHeader('set-cookie', [
      'field1=1; Domain=api.proxy.my; Path=/proxied/foo',
      'field2=2; Path=/',
      'dont=touch; Domain=some.other.domain; Path=/'
    ])
    next()
  })

  app.get('/*/encoding/error', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Encoding': 'gzip'
    })
    fs.createReadStream(`${__dirname}/../fixtures/index.html`)
      .pipe(res)
  })

  app.get('/*/encoding/z-buf-error', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Encoding': 'gzip'
    })
    fs.readFile(`${__dirname}/../fixtures/index.html`, (_err, buf) => {
      zlib.gzip(buf, (_err, buf) => {
        res.write(buf.slice(0, buf.length - 10))
        res.end()
      })
    })
  })

  app.get('/proxied/home/:encoding', (req, res) => {
    const { encoding } = req.params
    const contentEncoding = (encoding === 'br' || encoding === 'gzip')
      ? encoding
      : 'deflate'
    const compress = contentEncoding === 'br'
      ? zlib.createBrotliCompress()
      : contentEncoding === 'gzip'
        ? zlib.createGzip()
        : zlib.createDeflate()
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Encoding': contentEncoding
    })
    fs.createReadStream(`${__dirname}/../fixtures/index.html`)
      .pipe(compress).pipe(res)
  })

  app.get('/proxied/home/', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    fs.createReadStream(`${__dirname}/../fixtures/index.html`)
      .pipe(res)
  })

  // mirror
  app.use((req, res) => {
    const { method, url, headers, body } = req
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ method, url, headers, body }) + '\n')
  })

  let hp
  let hs

  parallel([
    cb => { hp = http.createServer(app).listen(port, cb) },
    cb => { hs = https.createServer(opts, app).listen(port + 443, cb) }
  ], cb)

  server.close = (cb) => {
    parallel([
      cb => hp.close(cb),
      cb => hs.close(cb)
    ], cb)
  }
}

module.exports = server

if (module === require.main) {
  server(3000)
}
