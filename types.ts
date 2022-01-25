export interface OpenApi {
    info: {
        title: string,
        description: string,
        version: string,
    },
    tags: Array<{
        name: string
    }>,
    paths: Record<string, Record<"get" | "post" | "put" | "delete", {
        summary: string,
        deprecated: boolean,
        description: string,
        operationId?: string,
        tags: string[],
        parameters?: Array<Parameter>
        requestBody?: RequestBody
        responses: Responses
    }>>,
    components: {
        schemas: Record<string, Schema>
    }
}

export interface Parameter {
    name: string,
    in: "query" | "header" | "path",
    description: string,
    required: boolean,
    schema: Schema
}

export interface RequestBody {
    content: Record<"application/json" | "multipart/form-data" | "application/x-www-form-urlencoded" | "*/*", {
        schema: Schema,
    }>
}

export type Responses = Record<string, {
    description: string,
    content: {
        "application/json"?: {
            schema: Schema,
        },
        [k: string]: unknown
    }
}>

export type Schema = ({
    type: "object",
    properties: Record<string, Schema>,
    required: string[]
} | {
    type: "array",
    items: Schema,
} | {
    type: "string" | "boolean" | "number" | "integer" | "null" | "any",
} | {
    "$ref": string,
} | {
    oneOf: Array<Schema>
} | {
    allOf: Array<Schema>
}) & {
    description?: string
}