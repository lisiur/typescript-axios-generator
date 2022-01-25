#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const handlebars_1 = __importDefault(require("handlebars"));
const typescript_1 = __importDefault(require("typescript"));
require("dotenv/config");
const url = process.env['API_URL'];
const lang = process.env['API_LANG'] = 'ts';
const outputDir = process.env['API_OUTPUT'];
if (!url) {
    throw new Error("未设置 API_URL");
}
if (!outputDir) {
    throw new Error("未设置 API_OUTPUT");
}
main(url, {
    lang,
    outputDir
});
function main(url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const openApiDefinition = yield fetchOpenApi(url);
        generate(openApiDefinition, options);
    });
}
function fetchOpenApi(url) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            http_1.default.get(url, (res) => {
                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', (chunk) => { rawData += chunk; });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(rawData);
                        resolve(parsedData);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            }).on('error', (e) => {
                reject(e);
            });
        });
    });
}
function generate(openApiDefinition, options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const apiTemplatePath = path_1.default.resolve(__dirname, './templates/api.handlebars');
        const apiTemplateContent = fs_1.default.readFileSync(apiTemplatePath).toString();
        const schemaTemplatePath = path_1.default.resolve(__dirname, './templates/schema.handlebars');
        const schemaTemplateContent = fs_1.default.readFileSync(schemaTemplatePath).toString();
        const modelsMap = new Map(Object.entries((_b = (_a = openApiDefinition.components) === null || _a === void 0 ? void 0 : _a.schemas) !== null && _b !== void 0 ? _b : {}).map(([modelName, modelSchema]) => {
            return [
                `#/components/schemas/${modelName}`,
                {
                    name: toCamelCase(modelName) + 'Model',
                    schema: modelSchema
                },
            ];
        }));
        const models = [...modelsMap.values()];
        const services = [];
        Object.entries(openApiDefinition.paths).forEach(([srvPath, srvDef]) => {
            Object.entries(srvDef).forEach(([method, srv]) => {
                var _a, _b, _c, _d, _e;
                const parameters = (_a = srv.parameters) !== null && _a !== void 0 ? _a : [];
                const pathParams = parameters.filter(item => item.in === 'path');
                const headers = parameters.filter(item => item.in === 'header');
                const queryParamsMap = new Map();
                const queryParams = [];
                for (const param of parameters.filter(item => item.in === 'query')) {
                    if ('type' in param.schema && param.schema.type === 'string') {
                        if (param.name.endsWith('[]')) {
                            param.name = param.name.slice(0, -2);
                            param.schema = Object.assign(Object.assign({}, param.schema), { type: 'array', items: {
                                    type: 'string'
                                } });
                            queryParams.push(param);
                        }
                        else if (param.name.includes('[].')) {
                            const [arrayName, propertyName] = param.name.split('[].');
                            if (!queryParamsMap.has(arrayName)) {
                                queryParamsMap.set(arrayName, {
                                    type: 'object',
                                    properties: {},
                                    required: [],
                                });
                            }
                            const schema = queryParamsMap.get(arrayName);
                            if ('properties' in schema) {
                                schema.properties[propertyName] = {
                                    type: 'string',
                                    description: param.description,
                                };
                                if (param.required) {
                                    schema.required.push(propertyName);
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
                    });
                }
                const requestBody = {
                    type: '',
                    schema: null
                };
                if ((_b = srv.requestBody) === null || _b === void 0 ? void 0 : _b.content['application/json']) {
                    requestBody.type = 'application/json';
                    requestBody.schema = srv.requestBody.content['application/json'].schema;
                }
                if ((_c = srv.requestBody) === null || _c === void 0 ? void 0 : _c.content['multipart/form-data']) {
                    requestBody.type = 'multipart/form-data';
                    requestBody.schema = srv.requestBody.content['multipart/form-data'].schema;
                }
                const successResponse = srv.responses['200'];
                const jsonResponse = {
                    description: successResponse.description,
                    schema: (_d = successResponse.content['application/json']) === null || _d === void 0 ? void 0 : _d.schema
                };
                let name = (_e = srv.operationId) !== null && _e !== void 0 ? _e : '';
                if (name) {
                    name = toCamelCase(name, true);
                }
                else {
                    name = toCamelCase(`${srvPath}/${method}`, true);
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
                });
            });
        });
        handlebars_1.default.registerHelper('ifCond', function (v1, operator, v2, options) {
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
        handlebars_1.default.registerHelper('isEmptyObj', function (v) {
            return typeof v === 'object' && Object.keys(v).length === 0 || v === undefined;
        });
        const schemaTemplate = handlebars_1.default.compile(schemaTemplateContent);
        handlebars_1.default.registerHelper("renderSchema", info => {
            return schemaTemplate(info);
        });
        handlebars_1.default.registerHelper("getRef", (info) => {
            var _a;
            return (_a = modelsMap.get(info)) === null || _a === void 0 ? void 0 : _a.name;
        });
        const template = handlebars_1.default.compile(apiTemplateContent);
        const output = template({ services, models });
        const outputDir = options.outputDir;
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, {
                recursive: true
            });
        }
        const apiPath = path_1.default.resolve(outputDir, 'api.ts');
        const apiJsPath = path_1.default.resolve(outputDir, 'api.js');
        const clientPath = path_1.default.resolve(outputDir, 'client.ts');
        const clientJsPath = path_1.default.resolve(outputDir, 'client.js');
        const clientContent = fs_1.default.readFileSync(path_1.default.resolve(__dirname, 'templates', 'client.template')).toString();
        fs_1.default.writeFileSync(apiPath, output);
        const lang = options.lang;
        let clientAlreadyExists = true;
        if (lang === 'ts' && !fs_1.default.existsSync(clientPath)) {
            clientAlreadyExists = false;
            fs_1.default.writeFileSync(clientPath, clientContent);
        }
        if (lang === 'js' && !fs_1.default.existsSync(clientJsPath)) {
            clientAlreadyExists = false;
        }
        if (lang === 'js') {
            // 生成 js
            fs_1.default.writeFileSync(apiJsPath, generateJs(output));
            if (!clientAlreadyExists) {
                fs_1.default.writeFileSync(clientJsPath, generateJs(clientContent));
            }
            // 生成 dts
            const files = [apiPath];
            if (!clientAlreadyExists) {
                files.push(clientPath);
            }
            const dtsOutput = generateDts(files);
            Object.entries(dtsOutput).forEach(([path, content]) => {
                fs_1.default.writeFileSync(path, content);
            });
            // 删除 ts
            fs_1.default.unlinkSync(apiPath);
            if (!clientAlreadyExists) {
                fs_1.default.unlinkSync(clientPath);
            }
        }
    });
}
function generateJs(tsContent) {
    const result = typescript_1.default.transpileModule(tsContent, {
        compilerOptions: {
            module: typescript_1.default.ModuleKind.ESNext,
            target: typescript_1.default.ScriptTarget.ESNext,
        }
    });
    return result.outputText;
}
function generateDts(tsFiles) {
    const options = {
        declaration: true,
        emitDeclarationOnly: true,
    };
    const host = typescript_1.default.createCompilerHost(options);
    const dtsFiles = {};
    host.writeFile = (fileName, content) => {
        dtsFiles[fileName] = content;
    };
    const program = typescript_1.default.createProgram(tsFiles, options, host);
    program.emit();
    return dtsFiles;
}
function toCamelCase(str, firstLowerCase = false) {
    const chunks = str.split(/[{}_/.-]/).filter(s => s !== '');
    if (firstLowerCase) {
        chunks[0] = lowerCaseFirstChar(chunks[0]);
    }
    else {
        chunks[0] = upperCaseFirstChar(chunks[0]);
    }
    for (let i = 1; i < chunks.length; i++) {
        chunks[i] = upperCaseFirstChar(chunks[i]);
    }
    return chunks.join('');
}
function lowerCaseFirstChar(str) {
    return str[0].toLowerCase() + str.slice(1);
}
function upperCaseFirstChar(str) {
    return str[0].toUpperCase() + str.slice(1);
}
