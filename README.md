# proxyy

> A http(s) proxy middleware

[![NPM version](https://badge.fury.io/js/proxyy.svg)](https://www.npmjs.com/package/proxyy/)
[![Build Status](https://app.travis-ci.com/commenthol/proxyy.svg?branch=master)](https://app.travis-ci.com/commenthol/proxyy)

Non-transparent http(s) proxy connect middleware with the ability to rewrite location headers and cookies.

Does:
- Adds `X-Forwarded-For` header entry.
- Copes with connection errors and timeouts.
- URL rewriting in HTML pages
- Rewrites Location headers
- Rewrites Cookie Domains and Paths (follows [nginx.org](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cookie_domain) approach)
- Rewrites Referer request headers

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
| `[option.noHtmlRewrite=false]`  | Boolean  | _optional:_  Do not rewrite html/ xml responses |

### Examples

**With Url**

```js
const proxy = require('proxyy')
const app = require('express')()

app.use('/api', proxy('https://server.my')
app.listen(3000)

//> proxies 'http://localhost:3000/api/path' to 'https://server.my/path'
```

**With options and legacy server**

```js
const http = require('http')

http.createServer(proxy({
  baseUrl: '/proxied',  // if using `express` 'baseUrl' is handled via express routing
                        // so no need to set this with `express`
  protocol: 'http:',
  host: 'server.my',
  port: '4000',
  path: '/api',
  timeout: 5000
})).listen(3000)

//> proxies 'http://localhost:3000/proxied/path' to 'http://server.my:4000/api/path'
```

**Rewriting Cookies**

```js
// proxy DNS is 'proxy.my'
app.use('/api', proxy(
  'https://api.server.my/path', {
    cookieDomains: [
      ['www.server.my', 'www.proxy.my'], // replace string by string
      [/^(\w+)\.server.com/, '$1.proxy.my'] // replace using regex
    ],
    cookiePaths: [
      ['/path', '/'], // replace string by string
      [/^(\w+)\/path(\/\w+)/, '$1$2'] // replace using regex
    ]
  }
))

//> Domain=www.server.my;  --> Domain=www.proxy.my;
//> Domain=api.server.com; --> Domain=api.proxy.my;

//> Path=/path;       --> Path=/;
//> Path=/a/path/doc; --> Path=/a/doc;
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
