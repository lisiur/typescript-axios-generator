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
        tags: string[],
        parameters?: Array<Parameter>
        requestBody?: RequestBody
        responses: Record<"200", {
            description: string,
            content: {
                "application/json": {
                    schema: Schema,
                }
            }
        }>
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