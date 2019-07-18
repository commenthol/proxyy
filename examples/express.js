/* eslint-disable no-console */

const app = require('express')()
const proxy = require('..')

app.use('/', proxy('https://expressjs.com'))
app.use((err, req, res, next) => {
  console.error('Error: %s', err.message)
  res.end()
})

app.listen(3000)
