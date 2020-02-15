const { parse, format } = require('url')
const http = require('http')
const https = require('https')
const {
  forwarded,
  joinPath,
  trimPath,
  rewriteLocation,
  rewriteHeaders,
  rewriteCookies
} = require('./utils')
const { htmlRewrite, shouldRewrite } = require('./htmlRewrite')
const { unzip, shouldUnzip, contentEncoding } = require('./unzip')
const log = require('debug')('proxyy')

const HTTP = 'http:'

const DEFAULT_OPTIONS = {
  method: 'GET',
  protocol: HTTP,
  timeout: 5000,
  baseUrl: '',
  onResponse: (pRes, res) => {}
}

/**
* non-transparent http(s) proxy connect middleware
*
* for possible options see
* @see https://nodejs.org/api/http.html#http_http_request_options_callback
* @see https://nodejs.org/api/https.html#https_https_request_options_callback
*
* @param {String} [url] - base url to proxy
* @param {Object} [options] - http, https options
* @param {String} options.method - upercase HTTP method
* @param {String} options.protocol - `http:` or `https:` see `require('url').parse`
* @param {String} options.hostname - hostname
* @param {String} options.port - port
* @param {String} options.path - path
* @param {Function} option.onResponse - `function (clientRes, res)` allows custom response manipulation like headers, statusCode
* @param {String} [option.baseUrl] - baseUrl of routed request, usually from express
* @param {Array} [options.cookieDomains] - `[{String|RegExp} match, {String} replacement], [...]`
* @param {Array} [options.cookiePaths] - `[{String|RegExp} match, {String} replacement], [...]`
* @param {Boolean} [options.preserveHost] - if `true` request host header is preserved
* @param {Boolean} [option.isForwarded] - request was forwarded from other server - pass-on `x-forwarded-host` and `x-forwarded-proto` headers
* @param {Boolean} [option.noXForwardedFor] - do not set X-Forwarded-For Header
* @param {Boolean} [option.noHtmlRewrite] - do not rewrite html
*
* @example <caption>url</caption>
* app.use(proxy('http://localhost:4000/'))
*
* @example <caption>options</caption>
* app.use({
*   protocol: 'http:',
*   host: 'localhost:4000',
*   port: '4000',
*   path: '/'
* ))
*/
function proxy (url, options) {
  if (typeof url === 'object') {
    options = url
    options.pathname = options.pathname || options.path // required by url.format
    url = options.url || format(options)
  }
  const _options = Object.assign({ headers: {} }, DEFAULT_OPTIONS, options, parse(url))
  if (!_options.preserveHost) _options.headers.host = _options.host
  delete _options.pathname

  return (req, res, next) => {
    const opts = Object.assign({}, _options)
    opts.method = req.method
    opts.baseUrl = req.baseUrl || opts.baseUrl || ''
    if (!opts.isForwarded) {
      delete req.headers['x-forwarded-host']
      delete req.headers['x-forwarded-proto']
    }
    rewriteHeaders(req, opts)
    opts.headers = Object.assign({}, req.headers, _options.headers)

    // construct proxy url
    opts.href = [
      opts.protocol, '//',
      opts.hostname, opts.port ? `:${opts.port}` : '',
      trimPath(opts.path)
    ].join('')
    if (!req.originalUrl && req.url.indexOf(opts.baseUrl) === 0) { // legacy server ... not express
      req.url = req.url.replace(opts.baseUrl, '')
    }
    opts.path = joinPath(opts.path, req.url)
    if (!opts.noXForwardedFor) {
      opts.headers['X-Forwarded-For'] = forwarded(req)
    }

    const transport = opts.protocol === HTTP ? http : https
    log('request: %o', opts)
    const pReq = transport.request(opts) // method, hostname, port, path, ...
    const onError = (err) => {
      err.status = 503
      log('%s', err)
      if (!res.finished) {
        if (res.headersSent) {
          res.end()
        } else if (next) {
          next(err)
        } else {
          res.statusCode = err.status
          res.end()
        }
      }
    }
    const onTimeout = () => {
      pReq.abort()
      onError(new Error('timeout'))
    }
    const timer = setTimeout(() => onTimeout(), opts.timeout)

    pReq.once('response', (pRes) => {
      clearTimeout(timer)
      if (res.finished) return

      log('response: %s - %o', pRes.statusCode, pRes.headers)

      res.statusCode = pRes.statusCode
      rewriteLocation(req, pRes, opts)
      rewriteCookies(req, pRes, opts)

      // --- header manipulation ---
      const _contentEncoding = contentEncoding(pRes)
      const doRewrite = !opts.noHtmlRewrite && shouldRewrite(pRes)
      const doUnzip = doRewrite && shouldUnzip(pRes)
      if (doUnzip) {
        delete pRes.headers['content-encoding']
        delete pRes.headers['content-length']
      }
      _options.onResponse(pRes, res) // allow custom response manipulation like headers, statusCode
      res.writeHead(pRes.statusCode, pRes.headers)
      res.once('error', onError)

      // --- pipes ---
      let stream = pRes

      if (doRewrite) {
        stream = stream.pipe(unzip({ contentEncoding: _contentEncoding })).pipe(htmlRewrite(opts))
      }
      stream.pipe(res)
    })
    pReq.once('timeout', onTimeout)
    pReq.on('error', onError)
    req.on('error', onError)
    req.pipe(pReq)
  }
}

module.exports = proxy
