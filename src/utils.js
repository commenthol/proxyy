const { resolve } = require('url')
const log = require('debug')('proxyy:utils')

const SECURE = /;\s*?(Secure)/i

// @see https://en.wikipedia.org/wiki/List_of_HTTP_header_fields#Common_non-standard_request_headers
const isSSL = (req) => req.connection.encrypted || (req.headers['x-forwarded-proto'] === 'https')
const getHost = (req) => req.headers['x-forwarded-host'] || req.headers['host']

const joinPath = (p1, p2) => {
  if (p2 === '/' || p2.indexOf('/?') === 0 || (/\/$/.test(p1) && /^\//.test(p2))) {
    p2 = p2.substr(1)
  }
  return p1 + p2 || '/'
}

const trimPath = (p) => p.replace(/\/+$/, '')

const forwarded = (req) =>
  (req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((f) => f.trim())
    .filter(f => f)
    .concat(req.connection.remoteAddress)
    .join(', ')

// ----

const rewriteUrl = (url, href, base) => resolve(href, url).replace(href, base)

// @see https://tools.ietf.org/html/rfc4229
const REWRITE_HEADERS = ['location', 'content-location', 'destination']

// @see https://tools.ietf.org/html/rfc7230
const rewriteLocation = (req, res, opts) => {
  const { href, baseUrl } = opts
  const proto = isSSL(req) ? 'https:' : 'http:'
  const host = getHost(req)
  // we always rewrite regardless of status code
  REWRITE_HEADERS.forEach((field) => {
    if (res.headers[field]) {
      // https://tools.ietf.org/html/rfc7231 allows relative urls
      let base = baseUrl
      if (host) {
        base = proto + '//' + host + baseUrl
      }
      res.headers[field] = rewriteUrl(res.headers[field], href, base)
    }
  })
}

// ----

const isArray = (arr) => Array.isArray(arr) && arr.length

/**
* @api private
* @param {String} value
* @param {String|RegExp} match - matching string or regex
* @param {String} repl - replacement
*/
const matcher = (value, match, repl) => {
  if (match instanceof RegExp && match.test(value)) {
    return value.replace(match, repl)
  } else if (value === match) {
    return repl
  }
}

/**
* @api private
* @param {Object} [opts]
* @param {Array} [opts.cookieDomains] - `[{String|RegExp} match, {String} replacement]`
* @param {Array} [opts.cookiePaths] - `[{String|RegExp} match, {String} replacement]`
*/
const rewriteCookies = (req, res, opts) => {
  if (!isArray(opts.cookieDomains) && !isArray(opts.cookiePaths)) return

  let cookies = res.headers['set-cookie']
  if (!Array.isArray(cookies)) {
    cookies = [cookies]
  }
  res.headers['set-cookie'] = cookies.map((cookie) => {
    let hasDomain = /Domain=/i.test(cookie) && isArray(opts.cookieDomains)
    let hasDomainRewrite = false
    let hasPathRewrite = false
    log('rewriteCookies in  %s', cookie)
    if (isArray(opts.cookieDomains)) {
      cookie = cookie
        .replace(/(Domain=)([^;]*?)(;|$)/i, (m, m1, domain, m3) => {
          for (let [match, repl] of opts.cookieDomains) {
            const _domain = matcher(domain, match, repl)
            if (_domain) {
              hasDomainRewrite = true
              return m1 + _domain + m3
            }
          }
          return m
        })
    }
    if (isArray(opts.cookiePaths) && (!hasDomain || hasDomainRewrite)) {
      cookie = cookie
        .replace(/(Path=)([^;]*?)(;|$)/i, (m, m1, path, m3) => {
          for (let [match, repl] of opts.cookiePaths) {
            const _path = matcher(path, match, repl)
            if (_path) {
              hasPathRewrite = true
              return m1 + _path + m3
            }
          }
          return m
        })
    }
    // change secure flag
    if (hasDomainRewrite || hasPathRewrite) {
      if (!isSSL(req)) {
        cookie = cookie.replace(SECURE, '')
      } else if (!SECURE.test(cookie)) {
        cookie += '; Secure'
      }
    }
    log('rewriteCookies out %s', cookie)
    return cookie
  })
}

module.exports = {
  forwarded,
  joinPath,
  trimPath,
  rewriteLocation,
  rewriteCookies
}
