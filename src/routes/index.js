const express = require('express')
const cloneDeep = require('lodash/cloneDeep')
const router = express.Router()
const config = require('../input/index.json')
const {query} = require('../oracleDriver')

const validateConfig = c => {
  const mandatoryAttrs = ['method', 'path', 'sql', 'outputFormat']

  mandatoryAttrs.forEach((a, nomindex) => {
    if (!c.hasOwnProperty(a)) {
      console.error(a)
      throw new Error(`Invalid configuration on item #${index}: ${a}`)
    }
  })
}

const normalizePath = path => {
  let normalized = path.replace(/}/g, '')
  normalized = normalized.replace(/{/g, ':')

  // Include initial '/' if neededcapture-species
  const firstChar = normalized.charAt(0)
  return firstChar === '/' ? normalized : `/${normalized}`
}

const formatResult = ({outputFormat, rawData}) => {
  // Validate output format
  if (
    !outputFormat ||
    !outputFormat.hasOwnProperty('result') ||
    !Array.isArray(outputFormat.result.entry) ||
    !outputFormat.result.entry[0]
  ) {
    console.error(outputFormat)
    throw new Error(
      `Output Format has not the standard shape: {"result:": {"entry": [ ENTRY_SHAPE ]}}`,
    )
  }

  // Validate rawData metadata
  if (!rawData || !rawData.hasOwnProperty('metaData')) {
    console.error(rawData)
    throw new Error(`Raw data has not the mandatory field: {"metaData:": [ ... ], ...}`)
  }

  // Validate rawData rows
  if (!rawData || !rawData.hasOwnProperty('rows') || !Array.isArray(rawData.rows)) {
    console.error(rawData)
    throw new Error(`Raw data has not the mandatory field: {"rows:": [ ... ], ...}`)
  }

  // Invert key:value to value:key to simplify result mapping
  const entryShape = outputFormat.result.entry[0]
  const invertedEntryShape = {}
  const keys = Object.keys(entryShape)
  keys.forEach(k => {
    const initialValue = entryShape[k]
    invertedEntryShape[initialValue] = k
  })
  // Exact dimentions indexes
  const dimention2index = rawData.metaData.reduce((result, currentValue, currentIndex) => {
    result[currentIndex] = invertedEntryShape[currentValue.name]
    return result
  }, [])

  // Format output
  outputFormat.result.entry = rawData.rows
    .slice(0)
    .map(r => {
      const m = {}
      dimention2index.forEach((d, index) => {
        m[d] = String(r[index])
      })
      return m
    })
    .slice(0)

  return cloneDeep(outputFormat)
}

const normalizeParams = ({params, configParams}) => {
  if (!Array.isArray(configParams)) {
    return
  }

  // Merge objects
  configParams.forEach(c => {
    c.value = params[c['query-param']]
  })

  // Sort values by order
  const compare = (a, b) => {
    if (a.ordinal < b.ordinal) {
      return -1
    }
    if (a.ordinal > b.ordinal) {
      return 1
    }
    return 0
  }
  configParams.sort(compare)

  // Return only values
  return configParams.map(c => c.value)
}

const normalizeSql = ({sql}) => {
  function nextChar(c) {
    return String.fromCharCode(c.charCodeAt(0) + 1)
  }

  function hasQuestionMarks({sql}) {
    return sql.indexOf(QUESTION_MARK) >= 0
  }

  const QUESTION_MARK = '?'
  let shouldContinue = hasQuestionMarks({sql})
  let char = 'a'

  // Replace any question mark "?" in the sql string, with :char (:a, :b, :c)
  while (shouldContinue) {
    // Replace first occurance of "?"
    sql = sql.replace(QUESTION_MARK, `:${char}`)

    // Does the string still contains a question mark?
    shouldContinue = hasQuestionMarks({sql})

    // Get next char
    char = nextChar(char)
  }

  return sql
}

// Dynamically generate express.js routes from input file
config.forEach(rawConfig => {
  const c = cloneDeep(rawConfig)
  validateConfig(c)

  const {method, path, params: configParams} = c

  router[method.toLowerCase()](normalizePath(path), async (req, res, next) => {
    const {params} = req
    const p = normalizeParams({
      params,
      configParams,
    })

    // Query db
    try {
      const rawDataFromDb = await query({
        sql: normalizeSql({sql: c.sql}),
        params: p,
      })

      const outputFormat = cloneDeep(c.outputFormat)
      const rawData = cloneDeep(rawDataFromDb)
      const formattedResult = formatResult({outputFormat, rawData})

      res.json(cloneDeep(formattedResult))
    } catch (err) {
      console.error(err.message)
      res.status(500).send(`500 internal error`)
    }
  })
})

module.exports = router
