# WSO2 to AWS API converter
Convert your WSO2 Datasource APIs to AWS API Gateway + Lambda. 

You can use this tool to convert your WSO2 REST and SOAP APIs to AWS-based solution. 
The tool is built on top of [Serverless Framework](https://serverless.com/).

The tool automaticallly add an AWS Lambda layer with the Node.js OracleDB client to interact with OracleDB databases. 

## Getting started
- Create your own `.env` file from `.env.example`. Refer to the annotations within the example file to know about the available configuration. 
- Proceed publishing your APIs using the `npm run deploy` command

## How does the tool internally work?
- The tool converts WSO2 REST and SOAP API exported configuration files to a JSON configuration file.
- The JSON configuration file is used to automatically generate APIs, taking into consideration any information provided by the exported WSO2 file, as such as the API path and parameters, the SQL query correspondent to the API, etc.
- The automatically generated APIs are added to an Express.js server
- Serverless framework conver the Express.js server to API gateway + Lambas APIs
- Serverless CLI is used to interact with AWS 

## Other available commands
- `npm run generate:input` will generate your JSON API configration file from the WSO2 xml definition
- `npm run package` will generate a zip file to manually deploy the API from the AWS console
- `npm run remove` to delete the project from AWS. 
- `npm start` will start a local server to run your API: use `my-token` as `x-api-key` authorization token
- Important! Make sure that `oraclelib/nodejs/` folder contains the NPM package `oracledb@3.1.2` (if not present manually download using `npm i oracledb@3.1.2` in the said folder)
