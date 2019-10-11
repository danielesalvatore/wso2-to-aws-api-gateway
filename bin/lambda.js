const serverlessExpress = require('aws-serverless-express');
const app = require("../src/app");
const server = serverlessExpress.createServer(app);

module.exports.handler = (event, context) => serverlessExpress.proxy(server, event, context);