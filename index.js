const bundle = require('./gulpfile')

bundle([])
  .then(file => console.log(file), err => console.error(err))
