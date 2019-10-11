const fs = require('fs')
const xml2js = require('xml2js')
const parser = new xml2js.Parser()
const path = require('path')
const yaml = require('js-yaml')

// Env file configuration
require('dotenv').config()

const validateContentSchema = content => {
  const {INPUT_FILE_FORMAT} = process.env

  if (!content.hasOwnProperty('data')) {
    throw new Error(`XML must contain a "data" attribute as root attribute: {data: "..."}`)
  }

  if (INPUT_FILE_FORMAT !== 'SOAP' && INPUT_FILE_FORMAT !== 'REST') {
    throw new Error(
      `'INPUT_FILE_FORMAT' should be one of the following values: ['REST', 'SOAP']. Found: ${INPUT_FILE_FORMAT}`,
    )
  }

  const {data} = content

  if (INPUT_FILE_FORMAT === 'REST') {
    if (!data.hasOwnProperty('resource') || !data.hasOwnProperty('query')) {
      throw new Error(
        `XML must contain "data.query" and "data.resource" attributes exist: {data: {query: [...], resource: [...] }}}`,
      )
    }

    const {resource, query} = content.data

    if (!Array.isArray(resource) || !Array.isArray(query)) {
      throw new Error(`"data.query" and "data.resource" attributes must be Arrays`)
    }
  }

  if (INPUT_FILE_FORMAT === 'SOAP') {
    if (!data.hasOwnProperty('operation') || !data.hasOwnProperty('query')) {
      throw new Error(
        `XML must contain "data.query" and "data.operation" attributes exist: {data: {query: [...], resource: [...] }}}`,
      )
    }
  }
}

const sanitizeStringFromCarriageReturns = str => str.replace(/[\n\r]/g, '')

// REST

const normalizeRESTQuery = q => {
  const result = {}

  // ID
  result.id = q.$.id

  // SQL query
  result.sql = q.sql[0]
  //result.sql = sanitizeStringFromCarriageReturns(result.sql)

  // final obj contains "name", "ordinal", "sqlType" attrs
  result.params = q.param.map(p => {
    return {
      ...p.$,
    }
  })

  try {
    result.outputFormat = q.result[0]._
    result.outputFormat = sanitizeStringFromCarriageReturns(result.outputFormat)
    // Remove trailing commas
    // 1. remove all spaces
    result.outputFormat = result.outputFormat.replace(/ /g, '')
    // 2. remove trailing commas
    result.outputFormat = result.outputFormat.replace(/,}/g, '}')
    result.outputFormat = result.outputFormat.replace(/,]/g, ']')
    // 3. Parse JSON
    result.outputFormat = JSON.parse(result.outputFormat)
    // 4. Validate that it is in standard format ie.: {"result:": {"entry": [ ENTRY_SHAPE ]}}
    // where ENTRY_SHAPE is a object with key:value as dataDimention:value
    if (
      !result.outputFormat.hasOwnProperty('result') ||
      !Array.isArray(result.outputFormat.result.entry) ||
      !result.outputFormat.result.entry[0]
    ) {
      console.error(result.outputFormat)
      throw new Error(
        `Output Format for query id: ${result.id} has not the standard shape: {"result:": {"entry": [ ENTRY_SHAPE ]}}`,
      )
    }
    // 5. Remove forbidden chars from output format
    const entry = result.outputFormat.result.entry[0]
    const keys = Object.keys(entry)
    const cleanEntry = {}
    keys.forEach(k => {
      const dirty = entry[k]
      cleanEntry[k] = dirty.replace(/\$/g, '')
    })
    result.outputFormat.result.entry = [cleanEntry]
  } catch (err) {
    console.error(err)
    throw new Error(`Impossible to parse the Output Format for query id: ${result.id}`)
  }

  return result
}

const normalizeRESTResource = r => {
  const result = {}

  // Method and Path
  const {method, path} = r.$
  result.method = method
  result.path = path

  const q = r['call-query'][0] // Always array of 1 item

  // Query correspondence
  result.href = q.$.href

  // Params correspondence
  result.params = q['with-param'].map(p => ({...p.$}))

  return result
}

const combineQueriesAndResource = ({queries, resources}) => {
  const results = []

  queries.forEach(q => {
    const {id} = q

    const r = resources.find(element => {
      return element.href === id
    })

    // There must be correspondance!
    if (!r) {
      throw new Error(`Impossible to find corrspondent resource to query with id "${id}"`)
    }

    // Merge params
    if (Array.isArray(q.params)) {
      q.params = q.params.map(p => {
        const pr = r.params.find(element => {
          return element.name === p.name
        })

        if (!pr) {
          throw new Error(
            `Impossible to find corrspondent parameter name ${p.name} in query with id "${id}"`,
          )
        }

        return {
          ...p,
          ...pr,
        }
      })
    }

    const item = {
      ...r,
      ...q, // q must be the last item, otherwise the params are overridden
    }

    results.push(item)
  })

  return results
}

// SOAP
const normalizeSOAPQuery = q => {
  const result = {}

  // ID
  result.id = q.$.id

  // SQL query
  result.sql = q.sql[0]
  //result.sql = sanitizeStringFromCarriageReturns(result.sql)

  // final obj contains "name", "ordinal", "sqlType" attrs
  result.params = q.param.map(p => {
    return {
      ...p.$,
    }
  })

  try {
    result.outputFormat = {}
    result.outputFormat.result = {}
    const dirty = q.result[0].element.map(e => ({[e.$.column]: e.$.name}))
    cleanEntry = dirty.reduce((acc, current) => {
      const keys = Object.keys(current)
      return {...acc, [keys[0]]: current[keys[0]]}
    }, {})
    result.outputFormat.result.entry = [cleanEntry]
  } catch (err) {
    console.error(err)
    throw new Error(`Impossible to parse the Output Format for query id: ${result.id}`)
  }

  return result
}

const normalizeSOAPOperation = r => {
  const result = {}

  // Method and Path
  const {name} = r.$
  result.method = 'GET' // force to be alway GET

  const q = r['call-query'][0] // Always array of 1 item

  // Query correspondence
  result.href = q.$.href

  // Params correspondence
  result.params = q['with-param'].map(p => ({...p.$}))

  // Path
  result.path = `${name}`
  result.params.forEach(p => {
    result.path = `${result.path}/{${p['query-param']}}`
  })

  return result
}

const createJsonConfig = content => {
  const {JSON_OUTPUT_PATH, INPUT_FILE_FORMAT} = process.env

  validateContentSchema(content)

  let config

  if (INPUT_FILE_FORMAT === 'REST') {
    const {query, resource} = content.data

    const queries = query.map(normalizeRESTQuery)
    const resources = resource.map(normalizeRESTResource)

    config = combineQueriesAndResource({queries, resources})
  }

  if (INPUT_FILE_FORMAT === 'SOAP') {
    const {query, operation} = content.data

    const queries = query.map(normalizeSOAPQuery)
    const operations = operation.map(normalizeSOAPOperation)

    config = combineQueriesAndResource({queries, resources: operations})
  }

  // Write json configuration file
  fs.writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(config))

  return config
}

const createYml = ({config}) => {
  const {SERVERLESS_CONFIG_TEMPLATE, SERVERLESS_CONFIG_FILE, ADD_CORS} = process.env

  const paths = config.map(c => ({
    http: {method: c.method, path: c.path, cors: ADD_CORS === 'true', private: true},
  }))

  // Load serverless.yml template configuration
  let template = yaml.safeLoad(fs.readFileSync(path.resolve(SERVERLESS_CONFIG_TEMPLATE), 'utf8'))

  // Add path to configuration
  template.functions.app.events = paths

  // AWS configurations
  const {
    AWS_LAMBDA_SECURITY_GROUP_IDS,
    AWS_SUBNET_IDS,
    AWS_LAMBDA_LOG_RETANTION_IN_DAYS = 14,
    AWS_LAMBDA_MEMORY_SIZE = 512,
    AWS_LAMBDA_USAGE_PLAN_QUOTA_LIMIT = 5000,
    AWS_LAMBDA_USAGE_PLAN_QUOTA_OFFSET = 2,
    AWS_LAMBDA_USAGE_PLAN_QUOTA_PERIOD = 'MONTH',
    AWS_LAMBDA_USAGE_PLAN_THROTTLE_BURST_LIMIT = 200,
    AWS_LAMBDA_USAGE_PLAN_THROTTLE_RATE_LIMIT = 100,
  } = process.env

  const vpc = template.provider.vpc || {}
  vpc.securityGroupIds = AWS_LAMBDA_SECURITY_GROUP_IDS.split(',')
  vpc.subnetIds = AWS_SUBNET_IDS.split(',')
  vpc.logRetentionInDays = AWS_LAMBDA_LOG_RETANTION_IN_DAYS
  vpc.memorySize = AWS_LAMBDA_MEMORY_SIZE

  // Add quota only if specified
  if (
    !!AWS_LAMBDA_USAGE_PLAN_QUOTA_LIMIT ||
    !!AWS_LAMBDA_USAGE_PLAN_QUOTA_OFFSET ||
    !!AWS_LAMBDA_USAGE_PLAN_QUOTA_PERIOD
  ) {
    if (!vpc.usagePlan) {
      vpc.usagePlan = {}
    }

    if (!vpc.usagePlan.quota) {
      vpc.usagePlan.quota = {}
    }
    vpc.usagePlan.quota.limit = AWS_LAMBDA_USAGE_PLAN_QUOTA_LIMIT
    vpc.usagePlan.quota.offset = AWS_LAMBDA_USAGE_PLAN_QUOTA_OFFSET
    vpc.usagePlan.quota.period = AWS_LAMBDA_USAGE_PLAN_QUOTA_PERIOD
  }

  // Add throttle only if specified
  if (!!AWS_LAMBDA_USAGE_PLAN_THROTTLE_BURST_LIMIT || !!AWS_LAMBDA_USAGE_PLAN_THROTTLE_RATE_LIMIT) {
    if (!vpc.usagePlan) {
      vpc.usagePlan = {}
    }

    if (!vpc.usagePlan.throttle) {
      vpc.usagePlan.throttle = {}
    }
    vpc.usagePlan.throttle.burstLimit = AWS_LAMBDA_USAGE_PLAN_THROTTLE_BURST_LIMIT
    vpc.usagePlan.throttle.rateLimit = AWS_LAMBDA_USAGE_PLAN_THROTTLE_RATE_LIMIT
  }

  template.provider.vpc = vpc

  // Write configuration file
  fs.writeFileSync(SERVERLESS_CONFIG_FILE, yaml.safeDump(template))
}

const init = () => {
  const {INPUT_FILE} = process.env
  const INPUT_PATH = path.resolve(INPUT_FILE)

  // Check if file exists
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error('Please specify an existing INPUT_FILE in .env file')
  }

  const content = fs.readFileSync(INPUT_PATH)

  // Parse XML WSO2 export
  parser.parseString(content, (err, result) => {
    if (err) {
      console.error(err)
      throw new Error('Impossible to parse the XML')
    }

    const config = createJsonConfig(result)

    // Create serverless.yml from JSON
    createYml({config})
  })
}

init()
