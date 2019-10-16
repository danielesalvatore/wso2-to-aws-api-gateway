# WSO2 to AWS API gateway
Convert your WSO2 Datasource APIs to AWS

## Getting started
- Create your own `.env` file from `.env.example`
- `npm run generate:input` will generate your API configration file from the WSO2 xml definitino
- `npm start` will start a local server to run your API: use `my-token` as `x-api-key` authorization token
- Make sure that `oraclelib/nodejs/` folder contains the NPM package `oracledb@3.1.2` (if not present manually download using `npm i oracledb@3.1.2` in the said folder)
- Proceed publishing your APIs from the AWS console