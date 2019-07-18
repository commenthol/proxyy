/* eslint-disable no-console */

const http = require('http')
const proxy = require('..')

http.createServer(proxy({
  baseUrl: '',
  protocol: 'https:',
  host: 'nodejs.org',
  path: '',
  timeout: 5000
})).listen(3000)
