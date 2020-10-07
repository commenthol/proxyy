const { resolve } = require('url')
const { WritableStream } = require('htmlparser2/lib/WritableStream')
const Through = require('streamss-through')
const log = require('debug')('proxyy:html')

const ELEMS_VOID = [
  'area',
  'base',
  'basefont',
  'bgsound',
  'br',
  'col',
  'command',
  'embed',
  'frame',
  'hr',
  'image',
  'img',
  'input',
  'isindex',
  'keygen',
  'link',
  'menuitem',
  'meta',
  'nextid',
  'param',
  'source',
  'track',
  'wbr'
]
const ELEMS_HREF = ['a', 'area', 'base', 'link']
const ELEMS_SRC = ['audio', 'embed', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video']

const htmlRewrite = (opts) => {
  let baseHref
  let isXML = false

  const baseUrl = opts.baseUrl || ''
  // proxy url
  const proxyUrl = opts.href
  // absolute client url
  const url = [opts.protocol, '//', opts.hostname, opts.port ? `:${opts.port}` : '', opts.path].join('').split('?')[0]

  log('base:"%s" proxy:"%s" client:"%s"', baseUrl, proxyUrl, url)

  const rewriteUrl = (_url) => {
    if (_url[0] === '#') return _url // #anchor
    return resolve(baseHref || url, _url).replace(proxyUrl, baseUrl)
  }

  const stream = new Through()

  function onopentag (name, attribs) {
    if (!isXML && name === 'html' && attribs.xmlns) isXML = true
    const close = !isXML
      ? '>'
      : ELEMS_VOID.includes(name)
        ? ' />'
        : '>'
    const attr = Object.keys(attribs).map(attr => {
      let content = attribs[attr]
      if (
        (attr === 'src' && ELEMS_SRC.includes(name)) ||
        (attr === 'href' && ELEMS_HREF.includes(name))
      ) {
        if (!baseHref && name === 'base') {
          baseHref = resolve(url, attribs[attr])
          log('baseHref is "%s"', baseHref)
        }
        content = rewriteUrl(attribs[attr])
      }
      return `${attr}="${content}"`
    }).join(' ')
    const str = `<${name}${attr ? ' ' : ''}${attr}${close}`
    stream.write(str)
  }
  function onclosetag (name) {
    if (!ELEMS_VOID.includes(name)) {
      const str = `</${name}>`
      stream.write(str)
    }
  }
  function ontext (text) {
    stream.write(text)
  }
  function onprocessinginstruction (name, data) {
    if (!isXML && /\?xml/.test(name)) isXML = true
    const str = `<${data}>`
    stream.write(str)
  }
  function oncomment (text) {
    const str = '<!--' + text
    stream.write(str)
  }
  function oncommentend () {
    stream.write('-->')
  }
  function onerror (err) {
    stream.emit('error', err)
  }
  function onend () {
    stream.end()
  }

  const parser = new WritableStream({
    onopentag,
    onclosetag,
    ontext,
    onprocessinginstruction,
    oncomment,
    oncommentend,
    onerror,
    onend
  }, { decodeEntities: true })

  parser.pipe = function (_stream) {
    stream.pipe(_stream)
    stream.on('error', err => {
      _stream.emit('error', err)
    })
  }
  parser.on('error', err => {
    onerror(err)
  })
  parser.on('end', () => {
    onend()
  })

  return parser
}

// check whether response needs html rewrite
const shouldRewrite = (res) => /^(text\/html|application\/xhtml\+xml|application\/vnd\.wap\.xhtml\+xml)/
  .test(res.headers['content-type'])

module.exports = {
  htmlRewrite,
  shouldRewrite
}
