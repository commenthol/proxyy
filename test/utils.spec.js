const assert = require('assert')
const { forwarded, joinPath, rewriteLocation, rewriteCookies } = require('../src/utils')

describe('forwarded', function () {
  const fakeReq = (ip, xForwarded) => {
    const req = {
      connection: { remoteAddress: ip },
      headers: {
        'x-forwarded-for': xForwarded
      }
    }
    return JSON.parse(JSON.stringify(req))
  }

  it('shall add remote address', function () {
    const res = forwarded(fakeReq('172.17.0.1'))
    assert.strictEqual(res, '172.17.0.1')
  })

  it('shall append to existing header', function () {
    const res = forwarded(fakeReq('172.17.0.1', '2.2.2.2'))
    assert.strictEqual(res, '2.2.2.2, 172.17.0.1')
  })

  it('shall append to list', function () {
    const res = forwarded(fakeReq('172.17.0.1', '2.2.2.2, 10.0.0.1'))
    assert.strictEqual(res, '2.2.2.2, 10.0.0.1, 172.17.0.1')
  })

  it('shall skip empty entries', function () {
    const res = forwarded(fakeReq('172.17.0.1', ',2.2.2.2,   ,,  10.0.0.1  '))
    assert.strictEqual(res, '2.2.2.2, 10.0.0.1, 172.17.0.1')
  })
})

describe('joinPath', function () {
  it('shall join empty paths', function () {
    assert.strictEqual(joinPath('', ''), '/')
  })
  it('shall join', function () {
    assert.strictEqual(joinPath('', '/'), '/')
  })
  it('shall join paths', function () {
    assert.strictEqual(joinPath('/api/', '/'), '/api/')
  })
  it('shall join paths with tailing slash', function () {
    assert.strictEqual(joinPath('/api', '/'), '/api')
  })
  it('shall join paths with query', function () {
    assert.strictEqual(joinPath('/api', '/?query'), '/api?query')
  })
  it('shall join two paths', function () {
    assert.strictEqual(joinPath('/api', '/path'), '/api/path')
  })
  it('shall join two paths with tailing slash', function () {
    assert.strictEqual(joinPath('/api/', '/path/'), '/api/path/')
  })
  it('shall not join paths with tailing slash and query', function () {
    assert.strictEqual(joinPath('/api/', '/path/?query'), '/api/path/?query')
  })
})

describe('rewriteLocation', function () {
  const fakeRes = (headers) => ({ headers })
  const fakeReq = (host, encrypted, forwardedHost, forwardedProto) => {
    const req = { headers: {}, connection: {} }
    if (host) req.headers.host = host
    if (encrypted) req.connection.encrypted = true
    if (forwardedHost) req.headers['x-forwarded-host'] = forwardedHost
    if (forwardedProto) req.headers['x-forwarded-proto'] = 'https'
    return req
  }

  it('shall replace location header', function () {
    const href = 'http://proxy.my/proxied'
    const baseUrl = ''
    const req = fakeReq('server.my')
    const res = fakeRes({ location: href + '/path' })
    rewriteLocation(req, res, { href, baseUrl })
    assert.strictEqual(res.headers.location, 'http://server.my/path')
  })

  it('shall replace content-location header', function () {
    const href = 'http://proxy.my/proxied'
    const baseUrl = ''
    const req = fakeReq()
    const res = fakeRes({ 'content-location': href + '/path' })
    rewriteLocation(req, res, { href, baseUrl })
    assert.strictEqual(res.headers['content-location'], '/path')
  })

  it('shall replace location header and path', function () {
    const href = 'http://proxy.my/proxied'
    const baseUrl = '/api'
    const req = fakeReq('server.my', true)
    const res = fakeRes({ location: href + '/path' })
    rewriteLocation(req, res, { href, baseUrl })
    assert.strictEqual(res.headers.location, 'https://server.my/api/path')
  })

  it('shall replace location header with relative path', function () {
    const href = 'http://proxy.my/proxied'
    const baseUrl = '/api'
    const req = fakeReq('server.my', true)
    const res = fakeRes({ location: '../proxied/path' })
    rewriteLocation(req, res, { href, baseUrl })
    assert.strictEqual(res.headers.location, 'https://server.my/api/path')
  })

  it('can not replace location header if remote switches to https', function () {
    const href = 'http://proxy.my/proxied'
    const baseUrl = '/api'
    const req = fakeReq('server.my', true)
    const res = fakeRes({ location: 'https://proxy.my/proxied/path' })
    rewriteLocation(req, res, { href, baseUrl })
    assert.strictEqual(res.headers.location, 'https://proxy.my/proxied/path')
  })
})

describe('rewriteCookies', function () {
  const fakeReq = (isSSL, headers = {}) => {
    const req = { headers, connection: {} }
    if (isSSL) req.connection.encrypted = true
    return req
  }
  const fakeRes = (cookies) => {
    const res = { headers: {} }
    if (cookies) res.headers['set-cookie'] = cookies
    return res
  }
  const opts = {
    cookieDomains: [
      ['localhost:3000', 'server.my'],
      [/^(\w+\.)?proxy(\.my)/, '$1server$2']
    ],
    cookiePaths: [
      ['/', '/api'],
      ['/api', '/'],
      [/^\/proxied(\/.*)$/, '$1']
    ]
  }
  const cookies = [
    'qwerty=value123; Domain=proxy.my; Path=/; Expires=Wed, 30 Aug 2019 00:00:00 GMT',
    'my=cookie; Domain=www.proxy.my; Path=/path',
    'test=456; Domain=localhost:3000; path=/proxied/path/to; Secure',
    'dont=touch; Domain=some.other.domain; Path=/api'
  ]

  it('should not rewrite cookies if cookieDomains and cookiePaths is missing', function () {
    const cookies = 'qwerty=value123; Domain=proxy.my; Path=/; Expires=Wed, 30 Aug 2019 00:00:00 GMT'
    const req = fakeReq()
    const res = fakeRes(cookies)
    rewriteCookies(req, res, {})
    assert.strictEqual(res.headers['set-cookie'], cookies)
  })

  it('should rewrite single cookie domain', function () {
    const cookies = 'qwerty=value123; Domain=proxy.my; Path=/; Expires=Wed, 30 Aug 2019 00:00:00 GMT'
    const req = fakeReq()
    const res = fakeRes(cookies)
    rewriteCookies(req, res, { cookieDomains: opts.cookieDomains })
    assert.deepStrictEqual(res.headers['set-cookie'], [
      'qwerty=value123; Domain=server.my; Path=/; Expires=Wed, 30 Aug 2019 00:00:00 GMT'
    ])
  })

  it('should rewrite cookie domains', function () {
    const req = fakeReq()
    const res = fakeRes(cookies)
    rewriteCookies(req, res, { cookieDomains: opts.cookieDomains })
    assert.deepStrictEqual(res.headers['set-cookie'], [
      'qwerty=value123; Domain=server.my; Path=/; Expires=Wed, 30 Aug 2019 00:00:00 GMT',
      'my=cookie; Domain=www.server.my; Path=/path',
      'test=456; Domain=server.my; path=/proxied/path/to',
      'dont=touch; Domain=some.other.domain; Path=/api'
    ])
  })

  it('should rewrite cookie paths', function () {
    const req = fakeReq()
    const res = fakeRes(cookies)
    rewriteCookies(req, res, { cookiePaths: opts.cookiePaths })
    assert.deepStrictEqual(res.headers['set-cookie'], [
      'qwerty=value123; Domain=proxy.my; Path=/api; Expires=Wed, 30 Aug 2019 00:00:00 GMT',
      'my=cookie; Domain=www.proxy.my; Path=/path',
      'test=456; Domain=localhost:3000; path=/path/to',
      'dont=touch; Domain=some.other.domain; Path=/'
    ])
  })

  it('should rewrite cookie domains and paths and add Secure flag', function () {
    const req = fakeReq(true)
    const res = fakeRes(cookies)
    rewriteCookies(req, res, opts)
    assert.deepStrictEqual(res.headers['set-cookie'], [
      'qwerty=value123; Domain=server.my; Path=/api; Expires=Wed, 30 Aug 2019 00:00:00 GMT; Secure',
      'my=cookie; Domain=www.server.my; Path=/path; Secure',
      'test=456; Domain=server.my; path=/path/to; Secure',
      'dont=touch; Domain=some.other.domain; Path=/api'
    ])
  })
})
