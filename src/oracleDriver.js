const oracledb = require('oracledb')
const {DATABASE_USERNAME, DATABASE_PASSWORD_SSM_PARAM, DATABASE_CONNECTION_STRING} = process.env

if (!DATABASE_USERNAME || !DATABASE_PASSWORD_SSM_PARAM || !DATABASE_CONNECTION_STRING) {
  throw new Error(
    'Please specify DATABASE_USERNAME, DATABASE_PASSWORD_SSM_PARAM, DATABASE_CONNECTION_STRING in .env file',
  )
}

const config = {
  user: DATABASE_USERNAME,
  connectString: DATABASE_CONNECTION_STRING,
}

module.exports.query = async ({sql, params}) => {
  let conn

  try {
    const AWS = require('aws-sdk')
    AWS.config.update({region: 'eu-west-1'})

    const SSM = require('aws-sdk/clients/ssm')
    const ssm = new SSM()
    const query = {
      Names: [DATABASE_PASSWORD_SSM_PARAM],
      WithDecryption: true,
    }
    let param = await ssm.getParameters(query).promise()

    if (
      !Array.isArray(param.Parameters) ||
      !param.Parameters.length ||
      !param.Parameters[0].Value
    ) {
      throw new Error('Impossible to retrieve the DB password from SSM parameter store')
    }

    const c = Object.assign({}, config, {
      password: param.Parameters[0].Value,
    })

    conn = await oracledb.getConnection(c)

    // Prevent SQL injection passing separaterly params and SQL string
    // https://stackoverflow.com/questions/38015313/preventing-sql-injection-in-node-oracledb
    const result = await conn.execute(sql, params)

    return result
  } catch (err) {
    console.error(err)
    throw new Error(err)
  } finally {
    if (conn) {
      // conn assignment worked, need to close
      await conn.close()
    }
  }
}
