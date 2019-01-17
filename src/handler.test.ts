import Ajv from 'ajv'
import test from 'ava'
import fs from 'fs-extra'
import getPort from 'get-port'
import globby from 'globby'
import got from 'got'
import jsf from 'json-schema-faker'
import path from 'path'
import pify from 'pify'
import qs from 'qs'
import seedrandom from 'seedrandom'
import tempy from 'tempy'
import * as FTS from '.'
import { requireHandlerFunction } from './require-handler-function'

const fixtures = globby.sync('./fixtures/**/*.ts')
const ajv = new Ajv({ useDefaults: true, coerceTypes: true })

jsf.option({
  alwaysFakeOptionals: true,
  // make values generated by json-schema-faker deterministic
  random: seedrandom('NzYxNDdlNjgxYzliN2FkNjFmYjBlMTI5')
})

for (const fixture of fixtures) {
  const { name, dir } = path.parse(fixture)
  const testConfigPath = path.join(process.cwd(), dir, 'config.json')

  test.serial(name, async (t) => {
    let testConfig = {
      get: true,
      post: true,
      postArray: true
    }

    if (fs.pathExistsSync(testConfigPath)) {
      testConfig = {
        ...testConfig,
        ...require(testConfigPath)
      }
    }

    const outDir = tempy.directory()
    const definition = await FTS.generateDefinition(fixture, {
      compilerOptions: {
        outDir
      },
      emit: true
    })
    t.truthy(definition)

    const jsFilePath = path.join(outDir, `${name}.js`)
    const handler = FTS.createHttpHandler(definition, jsFilePath)
    t.is(typeof handler, 'function')

    const port = await getPort()
    const server = await FTS.createHttpServer(handler, port)
    const url = `http://localhost:${port}`

    const params = await jsf.resolve(definition.params.schema)
    const paramsArray = definition.params.order.map((key) => params[key])
    const func = requireHandlerFunction(definition, jsFilePath)

    const expected = await Promise.resolve(func(...paramsArray))
    console.log({ name, params, port, expected })

    // test GET request with params as a query string
    // note: some fixtures will not support this type of encoding
    if (testConfig.get) {
      const query = qs.stringify(params)
      const responseGET = await got(url, {
        json: true,
        query
      })
      validateResponseSuccess(responseGET, 'GET', expected)
    }

    // test POST request with params as a json body object
    if (testConfig.post) {
      const responsePOST = await got.post(url, {
        body: params,
        json: true
      })
      validateResponseSuccess(responsePOST, 'POST', expected)
    }

    // test POST request with params as a json body array
    if (testConfig.postArray) {
      const responsePOSTArray = await got.post(url, {
        body: paramsArray,
        json: true
      })
      validateResponseSuccess(responsePOSTArray, 'POSTArray', expected)
    }

    await pify(server.close.bind(server))()
    await fs.remove(outDir)

    function validateResponseSuccess(
      res: got.Response<object>,
      label: string,
      expectedBody: any
    ) {
      console.log({
        body: res.body,
        label,
        statusCode: res.statusCode
      })
      t.is(res.statusCode, 200)

      const validateReturns = ajv.compile(definition.returns.schema)
      validateReturns(res.body)
      t.is(validateReturns.errors, null)

      if (typeof expectedBody === 'number' && isNaN(expectedBody)) {
        expectedBody = null
      }

      t.deepEqual(res.body, expectedBody)

      // TODO: snapshot statusCode, statusMessage, and body
    }
  })
}
