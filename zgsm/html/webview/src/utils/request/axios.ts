import axios, { type AxiosError, type AxiosResponse } from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
});

service.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error.response);
  },
);

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200)
      return response;

    throw new Error(response.status.toString());
  },
  (error: AxiosError<{ error_code?: number;[key: string]: any; }>) => {
    return Promise.reject(error);
  },
);

export default service;
