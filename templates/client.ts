import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

export interface RequestParams<Path = any, Query = any, Body = any, Header = any> {
    path: Path, 
    query: Query,
    body: Body,
    header: Header,
}

export interface RequestConfig<Params = RequestParams> extends AxiosRequestConfig {}

export interface RequestResponse<ResData = any, ReqParams = any> extends AxiosResponse {}

class Client {
    readonly #instance: AxiosInstance

    constructor() {
        this.#instance = axios.create({
            baseURL: "",
        })
    }
    // 发起请求
    request<Params = any, Data = any>(
        config: RequestConfig<Params>
    ): Promise<RequestResponse<Data, Params>> {
        return this.#instance.request(config);
    }

}

export default new Client()