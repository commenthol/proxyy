const fs = require('fs')
const http = require('http')
const assert = require('assert')
const request = require('supertest')
const express = require('express')
const proxy = require('..')
const server = require('./support/server')
const log = require('debug')('test:index')

const PORT = 3000
const PROX = 3001

describe('proxy', function () {
  before((done) => server(PORT, done))
  after((done) => server.close(done))

  describe('http url', function () {
    let app
    before((done) => {
      app = express()
      app.use(proxy(`http://localhost:${PORT}/test`, { timeout: 1000 }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall proxy /', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/test')
          assert.strictEqual(res.body.headers.host, 'localhost:3000')
          assert.ok(res.body.headers['x-forwarded-for'])
        })
        .expect(200, done)
    })

    it('shall proxy POST /', function (done) {
      request(`http://localhost:${PROX}`)
        .post('/')
        .send('test=test')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/test')
          assert.strictEqual(res.body.headers.host, 'localhost:3000')
          assert.strictEqual(res.body.body, 'test=test')
          assert.ok(res.body.headers['x-forwarded-for'])
        })
        .expect(200, done)
    })

    it('shall proxy /?query', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/?query=1')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/test?query=1')
          assert.strictEqual(res.body.headers.host, 'localhost:3000')
        })
        .expect(200, done)
    })

    it('shall proxy /a/path?query', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/a/path?query=1')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/test/a/path?query=1')
          assert.strictEqual(res.body.headers.host, 'localhost:3000')
        })
        .expect(200, done)
    })

    it('shall proxy statuscode 404', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/status/404')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/test/status/404')
          assert.strictEqual(res.body.headers.host, 'localhost:3000')
        })
        .expect(404, done)
    })

    it('shall timeout', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/godot')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.error, 'timeout')
        })
        .expect(503, done)
    })

    it('shall cope with destroyed connections', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/destroy')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.error, 'socket hang up')
          assert.strictEqual(res.body.code, 'ECONNRESET')
        })
        .expect(503, done)
    })

    it('shall not use forwarded host and proto', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/status/301')
        .set('x-forwarded-host', 'server.my')
        .set('x-forwarded-proto', 'https')
        .expect(res => {
          const { headers } = res
          log(headers)
          assert.strictEqual(headers.location, 'http://localhost:3000/status/200')
        })
        .expect(301, done)
    })
  })

  describe('http options', function () {
    let app
    before(done => {
      app = express()
      app.use(proxy({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: PORT,
        path: '/',
        timeout: 1000
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall proxy / to /options', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/')
          assert.strictEqual(res.body.headers.host, '127.0.0.1:3000')
        })
        .expect(200, done)
    })
  })

  describe('http options isForwarded', function () {
    let app
    before(done => {
      app = express()
      app.use(proxy({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: PORT,
        path: '/',
        timeout: 1000,
        isForwarded: true
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall get correct location', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/status/301')
        .set('x-forwarded-host', 'server.my')
        .set('x-forwarded-proto', 'https')
        .expect(res => {
          const { headers } = res
          log(headers)
          assert.strictEqual(headers.location, 'https://server.my/status/200')
        })
        .expect(301, done)
    })

    it('shall get correct absolute location', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/status/302')
        .set('x-forwarded-host', 'server.my')
        .set('x-forwarded-proto', 'https')
        .expect(res => {
          const { headers } = res
          log(headers)
          assert.strictEqual(headers.location, 'https://server.my/status/200')
        })
        .expect(302, done)
    })

    it('shall get correct relative location', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/status/303')
        .set('x-forwarded-host', 'server.my')
        .set('x-forwarded-proto', 'http')
        .expect(res => {
          const { headers } = res
          log(headers)
          assert.strictEqual(headers.location, 'http://server.my/status/200')
        })
        .expect(303, done)
    })
  })

  describe('http options preserveHost', function () {
    let app
    before(done => {
      app = express()
      app.use('/api', proxy({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: PORT,
        path: '/foo',
        timeout: 1000,
        preserveHost: true
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall preserve host', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/api/bar')
        .query({ foo: 'bar' })
        .set('host', 'server.my')
        .expect(res => {
          const { body } = res
          log(body)
          assert.strictEqual(body.url, '/foo/bar?foo=bar')
          assert.strictEqual(body.headers.host, 'server.my')
        })
        .expect(200, done)
    })
  })

  describe('http options legacy server', function () {
    let app
    before(done => {
      app = http.createServer(proxy({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: PORT,
        path: '/pathname',
        timeout: 1000
      }))
      app.listen(PROX, done)
    })
    after(done => app.close(done))

    it('shall proxy / to /pathname', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/test?foo=bar')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/pathname/test?foo=bar')
          assert.strictEqual(res.body.headers.host, '127.0.0.1:3000')
        })
        .expect(200, done)
    })

    it('shall timeout', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/godot')
        .expect(503, done)
    })
  })

  describe('https options', function () {
    let app
    before(done => {
      app = express()
      app.use(proxy({
        protocol: 'https:',
        hostname: 'localhost',
        port: PORT + 443,
        path: '/options',
        timeout: 1000,
        // rejectUnauthorized: false
        ca: fs.readFileSync(`${__dirname}/certs/root_ca.crt`)
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall proxy / to /options', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          log(res.body)
          assert.strictEqual(res.body.url, '/options')
          assert.strictEqual(res.body.headers.host, 'localhost:3443')
        })
        .expect(200, done)
    })
  })

  describe('http cookie rewrite', function () {
    let app
    before(done => {
      app = express()
      app.use(proxy({
        protocol: 'http:',
        hostname: 'localhost',
        port: PORT,
        path: '/proxied',
        timeout: 1000,
        cookieDomains: [
          [/^(\w+\.)?proxy(\.my)/, '$1server$2']
        ],
        cookiePaths: [
          ['/', '/api'],
          [/^\/proxied(\/.*)$/, '$1']
        ]
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall proxy with cookie rewrite', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/cookie')
        .expect('content-type', /^application\/json/)
        .expect(res => {
          const { headers } = res
          log(headers)
          assert.deepStrictEqual(headers['set-cookie'], [
            'field1=1; Domain=api.server.my; Path=/foo',
            'field2=2; Path=/api',
            'dont=touch; Domain=some.other.domain; Path=/'
          ])
        })
        .expect(200, done)
    })
  })

  describe('http html url rewrite', function () {
    let app
    before(done => {
      app = express()
      app.use(proxy({
        protocol: 'http:',
        hostname: 'localhost',
        port: PORT,
        path: '/',
        timeout: 1000
      }))
      app.use((err, req, res, next) => {
        res.statusCode = err.status || 500
        res.json({ error: err.message, code: err.code, status: res.statusCode })
      })
      const s = http.createServer(app).listen(PROX, done)
      app.close = (cb) => {
        s.close(cb)
      }
    })
    after(done => app.close(done))

    it('shall proxy with cookie rewrite', function (done) {
      request(`http://localhost:${PROX}`)
        .get('/proxied/home/')
        .expect('content-type', /^text\/html/)
        .expect(res => {
          const { text } = res
          log(text)
          const expFilename = `${__dirname}/fixtures/home.exp.html`
          // fs.writeFileSync(expFilename, text)
          const exp = fs.readFileSync(expFilename, 'utf8')
          assert.strictEqual(text, exp)
        })
        .expect(200, done)
    })
  })
})
