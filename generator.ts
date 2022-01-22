import fs from 'fs'
import path from 'path'
import Handlebars from 'handlebars'
import openApi from './openapi.json'
import {OpenApi} from './types'

const apiTemplatePath = path.resolve(__dirname, './templates/api.handlebars')
const apiTemplateContent = fs.readFileSync(apiTemplatePath).toString()
const schemaTemplatePath = path.resolve(__dirname, './templates/schema.handlebars')
const schemaTemplateContent = fs.readFileSync(schemaTemplatePath).toString()

const openApiDefinition = openApi as any as OpenApi

const modelsMap = new Map(Object.entries(openApiDefinition.components?.schemas ?? {}).map(([modelName, modelSchema]) => {
    return [
        `#/components/schemas/${modelName}`,
        {
            name: toCamelCase(modelName),
            schema: modelSchema
        },
    ]
}))
const models = [...modelsMap.values()]

const services: any[] = []

Object.entries(openApiDefinition.paths).forEach(([srvPath, srvDef]) => {
    Object.entries(srvDef).forEach(([method, srv]) => {
        const parameters = srv.parameters ?? []
        const pathParams = parameters.filter(item => item.in === 'path')
        const queryParams = parameters.filter(item => item.in === 'query')
        const headers = parameters.filter(item => item.in === 'header')

        const requestBody = {
            type: '',
            schema: null as any
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

        services.push({
            name: toCamelCase(`${srvPath}/${method}`),
            path: srvPath.replace(/\{(.*?)\}/g, "${params.path.$1}"),
            method,
            summary: srv.summary,
            deprecated: srv.deprecated,
            description: srv.description,
            tags: srv.tags,
            hasParams: pathParams.length + queryParams.length + headers.length > 0 || requestBody.schema,
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

Handlebars.registerHelper('ifCond', function (v1: any, operator: string, v2: any, options: any) {

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

const schemaTemplate = Handlebars.compile(schemaTemplateContent)
Handlebars.registerHelper("renderSchema", info => {
    return schemaTemplate(info)
})

Handlebars.registerHelper("getRef", (info: string) => {
    return modelsMap.get(info)?.name
})

const template = Handlebars.compile(apiTemplateContent)
const output = template({services, models})

if (!fs.existsSync(path.resolve(__dirname, 'api'))) {
    fs.mkdirSync(path.resolve(__dirname, 'api'))
}
fs.writeFileSync(path.resolve(__dirname, 'api', 'api.ts'), output)
fs.writeFileSync(path.resolve(__dirname, 'api', 'client.ts'), fs.readFileSync(path.resolve(__dirname, 'templates', 'client.ts')))


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



