# proxyy

> A http(s) proxy middleware

[![NPM version](https://badge.fury.io/js/proxyy.svg)](https://www.npmjs.com/package/proxyy/)
[![Build Status](https://secure.travis-ci.org/commenthol/proxyy.svg?branch=master)](https://travis-ci.org/commenthol/proxyy)

Non-transparent http(s) proxy connect middleware with the ability to rewrite location headers and cookies.

Does:
- Adds `X-Forward-For` header entry.
- Copes with connection errors and timeouts.
- URL rewriting in HTML pages
- Rewrites Location headers
- Rewrites Cookie Domains and Paths (follows [nginx.org](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cookie_domain) approach)

Why another proxy middleware? Check-out:
- [proxy-middleware](https://www.npmjs.com/package/proxy-middleware)
- [http-proxy-middleware](https://www.npmjs.com/package/http-proxy-middleware)
- [mod-proxy](https://www.npmjs.com/package/mod-proxy)
- Others?
- You choose...

## API

For all possible `options` related to http/https see
- [http request options](https://nodejs.org/api/http.html#http_http_request_options_callback)
- [https request options](https://nodejs.org/api/https.html#https_https_request_options_callback)

### Parameters

| parameter                 | type     | description                    |
| ------------------------- | -------- | -------------------------------|
| `[url]`                   | String   | _optional:_ base url to proxy  |
| `[options]`               | Object   | _optional:_ http, https options |
| `options.method`          | String   | upercase HTTP method |
| `options.protocol`        | String   | `http:` or `https:` see [url.parse()][url.parse] |
| `options.hostname`        | String   | hostname |
| `options.port`            | String   | port     |
| `options.path`            | String   | path     |
| `[options.timeout=5000]`  | Number   | _optional:_ timeout in (ms) default=5000 |
| `[option.onResponse]`     | Function | _optional:_ `function (clientRes, res)` allows to change statuscode and/or headers |
| `[option.baseUrl]`        | String   | _optional:_ baseUrl of routed request, comes usually from express |
| `[options.cookieDomains]` | Array    | _optional:_  see example |
| `[options.cookiePaths]`   | Array    | _optional:_  see example |
| `[options.preserveHost=false]`  | Boolean  | _optional:_  if `true` request host header is preserved |
| `[option.isForwarded=false]`    | Boolean  | _optional:_  request was forwarded from other server which set `x-forwarded-host` and `x-forwarded-proto` headers |

### Examples

**With Url**

```js
const proxy = require('proxyy')
const app = require('express')()

app.use('/api', proxy('https://proxy.my')
app.listen(3000)

//> proxies 'http://localhost:3000/api/path' to 'https://proxy.my/path'
```

**With options and legacy server**

```js
const http = require('http')

http.createServer(proxy({
  baseUrl: '/api',  // if using `express` 'baseUrl' is handled via express routing
                    // so no need to set this with `express`
  protocol: 'http:',
  host: 'proxy.my',
  port: '4000',
  path: '/proxied',
  timeout: 5000
})).listen(3000)

//> proxies 'http://localhost:3000/api/path' to 'http://proxy.my:4000/proxied/path'
```

**Rewriting Cookies**

```js
app.use('/api', proxy(
  'https://api.proxy.my/proxy', {
    cookieDomains: [
      ['www.proxy.my', 'www.server.my'], // replace string by string
      [/^(\w+)\.proxy.com/, '$1.server.my'] // replace using regex
    ],
    cookiePaths: [
      ['/proxy', '/'], // replace string by string
      [/^(\w+)\/proxy(\/\w+)/, '$1$2'] // replace using regex
    ]
  }
))

//> Domain=www.proxy.my;  --> Domain=www.server.my;
//> Domain=api.proxy.com; --> Domain=api.server.my;

//> Path=/proxy;        --> Path=/;
//> Path=/a/proxy/path; --> Path=/a/path;
```

## Installation

Requires [nodejs](http://nodejs.org/).

```sh
$ npm install proxyy --save
```

## Tests

```sh
$ npm test
```

## License

[MIT Licensed](./LICENSE.md)

[url.parse]: https://nodejs.org/api/url.html#url_url_parse_urlstring_parsequerystring_slashesdenotehost
