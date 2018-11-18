const fs = require('fs')
const assert = require('assert')
const through = require('streamss-through')
const htmlRewrite = require('../src/htmlRewrite')
const { joinPath, trimPath } = require('../src/utils')

function testCase (opts, done) {
  // proxy url
  opts.href = [opts.protocol, '//', opts.hostname, opts.port ? `:${opts.port}` : '', trimPath(opts.path)].join('')
  // proxied client url
  opts.path = joinPath(opts.path, '/home/')

  const buffer = []

  fs.createReadStream(opts._fixtures.in)
    .pipe(htmlRewrite(opts)).pipe(through(
      (data) => {
        buffer.push(data)
        // process.stdout.write(data)
      },
      () => {
        const buf = Buffer.concat(buffer)
        const expFilename = opts._fixtures.exp
        // fs.writeFileSync(expFilename, buf)
        const exp = fs.readFileSync(expFilename, 'utf8')
        assert.strictEqual(buf.toString(), exp)
        done()
      }
    ))
}

describe('htmlRewrite', function () {
  it('shall rewrite home/index.html', function (done) {
    const file = 'index'
    const opts = {
      protocol: 'http:',
      hostname: 'proxy.my',
      port: null,
      path: '/',
      baseUrl: '/proxy',
      _fixtures: {
        in: `${__dirname}/fixtures/${file}.html`,
        exp: `${__dirname}/fixtures/${file}.exp.html`
      }
    }
    testCase(opts, done)
  })

  it('shall rewrite base.html', function (done) {
    const file = 'base'
    const opts = {
      protocol: 'http:',
      hostname: 'proxy.my',
      port: null,
      path: '/',
      baseUrl: '/proxy',
      _fixtures: {
        in: `${__dirname}/fixtures/${file}.html`,
        exp: `${__dirname}/fixtures/${file}.exp.html`
      }
    }
    testCase(opts, done)
  })

  it('shall rewrite mp.xhtml switching to XML mode', function (done) {
    const file = 'mp'
    const opts = {
      protocol: 'http:',
      hostname: 'proxy.my',
      port: null,
      path: '/',
      baseUrl: '/proxy',
      _fixtures: {
        in: `${__dirname}/fixtures/${file}.xhtml`,
        exp: `${__dirname}/fixtures/${file}.exp.xhtml`
      }
    }
    testCase(opts, done)
  })

  it('shall rewrite mp-min.xhtml switching to XML mode', function (done) {
    const file = 'mp-min'
    const opts = {
      protocol: 'http:',
      hostname: 'proxy.my',
      port: null,
      path: '/',
      baseUrl: '/proxy',
      _fixtures: {
        in: `${__dirname}/fixtures/${file}.xhtml`,
        exp: `${__dirname}/fixtures/${file}.exp.xhtml`
      }
    }
    testCase(opts, done)
  })

  it('shall cope with errors', function (done) {
    const opts = {
      protocol: 'http:',
      hostname: 'proxy.my',
      port: null,
      path: '/',
      baseUrl: '/proxy'
    }
    const reader = through()
    const html = htmlRewrite(opts)
    const writer = through(
      function (data) {
        // console.log('data %s', data)
        assert.ok(!/<dont>/.test(data.toString()))
      }
    )
    writer.on('error', (err) => {
      assert.ok(err)
      done()
    })
    writer.on('end', () => done())
    reader.pipe(html).pipe(writer)
    reader.write('<this></is><bad>')
    html.emit('error', new Error('boom'))
    reader.write('<dont></reach>')
    reader.end()
  })
})
