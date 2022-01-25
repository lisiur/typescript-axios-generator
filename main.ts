#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import http from 'http'
import { OpenApi, Parameter, Responses, Schema } from './types'
import Handlebars, { HelperOptions } from 'handlebars'
import ts from "typescript"
import 'dotenv/config'

const url = process.env['API_URL'] as string
const lang = (process.env['API_LANG']) as "ts" | "js" || 'ts'
const outputDir = process.env['API_OUTPUT'] as string

if (!url) {
    throw new Error("未设置 API_URL")
}
if (!outputDir) {
    throw new Error("未设置 API_OUTPUT")
}

main(url, {
    lang,
    outputDir
})

async function main(url: string, options: {lang: 'js' | 'ts', outputDir: string}) {
    const openApiDefinition = await fetchOpenApi(url)
    generate(openApiDefinition, options)
}

async function fetchOpenApi(url: string): Promise<OpenApi> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData)
                } catch (e) {
                    reject(e)
                }
            });
        }).on('error', (e) => {
            reject(e)
        });
    })
}

async function generate(openApiDefinition: OpenApi, options: { lang: 'ts' | 'js', outputDir: string }) {
    const apiTemplatePath = path.resolve(__dirname, './templates/api.handlebars')
    const apiTemplateContent = fs.readFileSync(apiTemplatePath).toString()
    const schemaTemplatePath = path.resolve(__dirname, './templates/schema.handlebars')
    const schemaTemplateContent = fs.readFileSync(schemaTemplatePath).toString()
    const modelsMap = new Map(Object.entries(openApiDefinition.components?.schemas ?? {}).map(([modelName, modelSchema]) => {
        return [
            `#/components/schemas/${modelName}`,
            {
                name: toCamelCase(modelName) + 'Model',
                schema: modelSchema
            },
        ]
    }))
    const models = [...modelsMap.values()]

    const services: Array<{
                name: string,
                CamelCaseName: string,
                path: string,
                method: string,
                summary: string,
                deprecated: boolean,
                description: string,
                tags: Array<string>,
                hasParams: boolean,
                pathParams: Array<Parameter>,
                queryParams: Array<Parameter>,
                headers: Array<Parameter>,
                requestBody: {
                    type: string,
                    schema: Schema | null,
                },
                queryParamsRequired: boolean,
                headersRequired: boolean,
                requestBodyRequired: boolean,
                responses: Responses,
                jsonResponse: {
                    description: string,
                    schema?: Schema
                },
    }> = []

    Object.entries(openApiDefinition.paths).forEach(([srvPath, srvDef]) => {
        Object.entries(srvDef).forEach(([method, srv]) => {
            const parameters = srv.parameters ?? []
            const pathParams = parameters.filter(item => item.in === 'path')
            const headers = parameters.filter(item => item.in === 'header')
            const queryParamsMap: Map<string, Schema> = new Map()
            const queryParams: Array<Parameter> = []
            for (const param of parameters.filter(item => item.in === 'query')) {
                if ('type' in param.schema && param.schema.type === 'string') {
                    if (param.name.endsWith('[]')) {
                        param.name = param.name.slice(0, -2)
                        param.schema = {
                            ...param.schema,
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        }
                        queryParams.push(param)
                    } else if (param.name.includes('[].')) {
                        const [arrayName, propertyName] = param.name.split('[].')
                        if (!queryParamsMap.has(arrayName)) {
                            queryParamsMap.set(arrayName, {
                                type: 'object',
                                properties: {},
                                required: [],
                            })
                        }
                        const schema = queryParamsMap.get(arrayName) as Schema
                        if ('properties' in schema) {
                            schema.properties[propertyName] = {
                                type: 'string',
                                description: param.description,
                            }
                            if (param.required) {
                                schema.required.push(propertyName)
                            }
                        }
                    }
                }
            }
            for (const [arrayName, itemSchema] of queryParamsMap.entries()) {
                queryParams.push({
                    name: arrayName,
                    required: true,
                    in: 'query',
                    description: '',
                    schema: {
                        type: 'array',
                        items: itemSchema,
                    }
                })
            }

            const requestBody = {
                type: '',
                schema: null as null | Schema
            }
            if (srv.requestBody?.content['application/json']) {
                requestBody.type = 'application/json'
                requestBody.schema = srv.requestBody.content['application/json'].schema
            }
            if (srv.requestBody?.content['multipart/form-data']) {
                requestBody.type = 'multipart/form-data'
                requestBody.schema = srv.requestBody.content['multipart/form-data'].schema
            }

            const successResponse = srv.responses['200']
            const jsonResponse = {
                description: successResponse.description,
                schema: successResponse.content['application/json']?.schema
            }

            let name = srv.operationId ?? ''
            if (name) {
                name = toCamelCase(name, true)
            } else {
                name = toCamelCase(`${srvPath}/${method}`, true)
            }
            services.push({
                name,
                CamelCaseName: toCamelCase(name),
                path: srvPath.replace(/\{(.*?)\}/g, "${params.path.$1}"),
                method,
                summary: srv.summary,
                deprecated: srv.deprecated,
                description: srv.description,
                tags: srv.tags,
                hasParams: pathParams.length + queryParams.length + headers.length > 0 || !!requestBody.schema,
                pathParams,
                queryParams,
                headers,
                requestBody,
                queryParamsRequired: queryParams.some(it => it.required),
                headersRequired: headers.some(it => it.required),
                requestBodyRequired: true,
                responses: srv.responses,
                jsonResponse,
            })
        })
    })

    Handlebars.registerHelper('ifCond', function (v1: string, operator: string, v2: string, options: HelperOptions) {
        switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
        }
    });
    Handlebars.registerHelper('isEmptyObj', function(v?: object) {
        return typeof v === 'object' && Object.keys(v).length === 0 || v === undefined
    })

    const schemaTemplate = Handlebars.compile(schemaTemplateContent)
    Handlebars.registerHelper("renderSchema", info => {
        return schemaTemplate(info)
    })

    Handlebars.registerHelper("getRef", (info: string) => {
        return modelsMap.get(info)?.name
    })

    const template = Handlebars.compile(apiTemplateContent)
    const output = template({ services, models })

    const outputDir = options.outputDir
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {
            recursive: true
        })
    }

    const apiPath = path.resolve(outputDir, 'api.ts')
    const apiJsPath = path.resolve(outputDir, 'api.js')
    const clientPath = path.resolve(outputDir, 'client.ts')
    const clientJsPath = path.resolve(outputDir, 'client.js')
    const clientContent = fs.readFileSync(path.resolve(__dirname, 'templates', 'client.template')).toString()

    fs.writeFileSync(apiPath, output)

    const lang = options.lang
    let clientAlreadyExists = true
    if (lang === 'ts' && !fs.existsSync(clientPath)) {
        clientAlreadyExists = false
        fs.writeFileSync(clientPath, clientContent)
    }
    if (lang === 'js' && !fs.existsSync(clientJsPath)) {
        clientAlreadyExists = false
        fs.writeFileSync(clientPath, clientContent)
    }

    if (lang === 'js') {
        // 生成 js
        fs.writeFileSync(apiJsPath, generateJs(output))

        if (!clientAlreadyExists) {
            fs.writeFileSync(clientJsPath, generateJs(clientContent))
        }

        // 生成 dts
        const files = [apiPath]
        if (!clientAlreadyExists) {
            files.push(clientPath)
        }
        const dtsOutput = generateDts(files)
        Object.entries(dtsOutput).forEach(([path, content]) => {
            fs.writeFileSync(path, content)
        })

        // 删除 ts
        fs.unlinkSync(apiPath)
        if (!clientAlreadyExists) {
            fs.unlinkSync(clientPath)
        }
    }

}

function generateJs(tsContent: string): string {
    const result = ts.transpileModule(tsContent, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
        }
    })
    return result.outputText
}

function generateDts(tsFiles: string[]) {
    const options = {
        declaration: true,
        emitDeclarationOnly: true,
    }
    const host = ts.createCompilerHost(options)
    const dtsFiles: Record<string, string> = {}
    host.writeFile = (fileName, content) => {
        dtsFiles[fileName] = content
    }
    const program = ts.createProgram(tsFiles, options, host)
    program.emit()
    return dtsFiles
}

function toCamelCase(str: string, firstLowerCase = false) {
    const chunks = str.split(/[{}_/.-]/).filter(s => s !== '')
    if (firstLowerCase) {
        chunks[0] = lowerCaseFirstChar(chunks[0])
    } else {
        chunks[0] = upperCaseFirstChar(chunks[0])
    }
    for (let i = 1; i < chunks.length; i++) {
        chunks[i] = upperCaseFirstChar(chunks[i])
    }
    return chunks.join('')
}

function lowerCaseFirstChar(str: string) {
    return str[0].toLowerCase() + str.slice(1)
}

function upperCaseFirstChar(str: string) {
    return str[0].toUpperCase() + str.slice(1)
}