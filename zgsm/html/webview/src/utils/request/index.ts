import type { AxiosProgressEvent, AxiosRequestConfig, AxiosResponse, GenericAbortSignal } from 'axios';
import request from './axios';

export interface HttpOption extends AxiosRequestConfig {
  url: string;
  data?: any;
  method?: string;
  headers?: any;
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void;
  signal?: GenericAbortSignal;
  beforeRequest?: () => void;
  afterRequest?: () => void;
}

export interface Response<T = any> {
  response: any;
  data: T;
  message: string | null;
  success: boolean;
  total: number;
}

export interface GetListParams {
  page?: number;
  per?: number;
  sort_by?: string;
  sort_to?: string;
  search?: string;
  creator?: string;
}

export const defaultListParams = {
  page: 1,
  per: 20,
};

type Methods = 'get' | 'post' | 'delete' | 'put';

function http<T = any>(
  { url, data, method, headers, onDownloadProgress, signal, beforeRequest, afterRequest, ...otherAxiosRequestConfig }: HttpOption,
) {
  const successHandler = (res: AxiosResponse<Response<T>>) => {
    // todo czh: Here, we need to focus on testing abnormal scenarios. The data format returned by the backend interface is not well encapsulated.
    if (res.data.success === true || typeof res.data === 'string' || res.data)
      return res.data;

    return Promise.reject(res.data);
  };

  const failHandler = (error: Response<Error>) => {
    afterRequest?.();

    if (String(error).includes('timeout'))
      throw new Error('Request timed out. Please try again.');

    if (error?.response?.status === 500)
      throw new Error('500');

    else
      throw new Error(error?.response?.data.message || error?.message || 'Error');
  };

  beforeRequest?.();

  method = method || 'get';

  const params = Object.assign(typeof data === 'function' ? data() : data ?? {}, {});

  switch (method) {
    case 'put':
    case 'post':
      return request[method as Methods](url, params, { headers, signal, onDownloadProgress, ...otherAxiosRequestConfig }).then(successHandler, failHandler);
    default:
      return request[method as Methods](url, { params, headers, signal, onDownloadProgress, ...otherAxiosRequestConfig }).then(successHandler, failHandler);
  }
}

export function get<T = any>(
  { url, data, method = 'get', headers, onDownloadProgress, signal, beforeRequest, afterRequest, ...otherAxiosRequestConfig }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    ...otherAxiosRequestConfig,
  });
}

export function post<T = any>(
  { url, data, method = 'post', headers, onDownloadProgress, signal, beforeRequest, afterRequest, ...otherAxiosRequestConfig }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    ...otherAxiosRequestConfig,
  });
}

export function update<T = any>(
  { url, data, method = 'put', headers, onDownloadProgress, signal, beforeRequest, afterRequest, ...otherAxiosRequestConfig }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    ...otherAxiosRequestConfig,
  });
}

export function del<T = any>(
  { url, data, method = 'delete', onDownloadProgress, signal, beforeRequest, afterRequest, ...otherAxiosRequestConfig }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    ...otherAxiosRequestConfig,
  });
}

export default post;
