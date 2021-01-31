module.exports = {
  extends: 'standard',
  env: {
    es6: true,
    mocha: true
  },
  rules: {
    strict: 'off',
    'no-console': 'error',
    'node/no-deprecated-api': 'warn',
    'node/no-path-concat': 'off'
  }
}
