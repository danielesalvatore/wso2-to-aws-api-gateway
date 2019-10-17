const express = require('express')
const logger = require('morgan')
const helmet = require('helmet')
const cors = require('cors')
const routes = require('./routes/')

// Env file configuration
require('dotenv').config()

const app = express()

app.use(cors())
app.use(helmet())
app.use(logger('dev'))
app.use(express.json())

app.use(
  express.urlencoded({
    extended: false,
  }),
)

app.use('/', routes)

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  console.error(err)

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

module.exports = app
