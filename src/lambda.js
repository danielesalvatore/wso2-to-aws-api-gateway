const serverlessExpress = require('aws-serverless-express')
const app = require('./app')
const server = serverlessExpress.createServer(app)

module.exports.handler = (event, context) => serverlessExpress.proxy(server, event, context)
