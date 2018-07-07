const {parse, format} = require('url')
const http = require('http')
const https = require('https')
const log = require('debug')('proxyy')
const {forwarded, joinPath, trimPath, rewriteLocation, rewriteCookies} = require('./utils')
const htmlRewrite = require('./htmlRewrite')

const HTTP = 'http:'

const DEFAULT_OPTIONS = {
  method: 'GET',
  protocol: HTTP,
  timeout: 5000,
  baseUrl: '',
  onResponse: (cRes, res) => {}
}

module.exports = proxy

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
  const _options = Object.assign({headers: {}}, DEFAULT_OPTIONS, options, parse(url))
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
    opts.headers = Object.assign({}, req.headers, _options.headers)

    // construct proxy url
    opts.href = [opts.protocol, '//', opts.hostname, opts.port ? `:${opts.port}` : '', trimPath(opts.path)].join('')
    if (!req.originalUrl && req.url.indexOf(opts.baseUrl) === 0) { // legacy server ... not express
      req.url = req.url.replace(opts.baseUrl, '')
    }
    opts.path = joinPath(opts.path, req.url)
    if (!opts.noXForwardedFor) {
      opts.headers['X-Forwarded-For'] = forwarded(req)
    }

    const transport = opts.protocol === HTTP ? http : https
    log('opts %o', opts)
    const cReq = transport.request(opts) // method, hostname, port, path, ...
    const onError = (err) => {
      err.status = 503
      log(err)
      if (!res.finished) {
        if (next) {
          next(err)
        } else {
          res.statusCode = err.status
          res.end()
        }
      }
    }
    const onTimeout = () => {
      cReq.abort()
      onError(new Error('timeout'))
    }
    const timer = setTimeout(() => onTimeout(), opts.timeout)

    cReq.on('response', (cRes) => {
      clearTimeout(timer)
      if (res.finished) return

      res.statusCode = cRes.statusCode
      rewriteLocation(req, cRes, opts)
      rewriteCookies(req, cRes, opts)
      _options.onResponse(cRes, res) // allow custom response manipulation like headers, statusCode

      res.writeHead(cRes.statusCode, cRes.headers)
      if (
        /^(text\/html|application\/xhtml\+xml|application\/vnd\.wap\.xhtml\+xml)/
          .test(cRes.headers['content-type'])
      ) {
        cRes.pipe(htmlRewrite(opts)).pipe(res)
      } else {
        cRes.pipe(res)
      }
    })
    cReq.on('timeout', onTimeout)
    cReq.on('error', onError)
    req.on('error', onError)
    req.pipe(cReq)
  }
}

