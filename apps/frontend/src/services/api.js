import { API_URL, DEV_USER_ID } from '../constants/api.js';

export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message || 'Error inesperado');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details || [];
  }
}

async function request(method, path, body) {
  const isForm = body instanceof FormData;
  const headers = {};
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (DEV_USER_ID) headers['x-dev-user-id'] = DEV_USER_ID;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'No se pudo conectar con el servidor' });
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? { code: 'UNKNOWN_ERROR', message: 'Error inesperado' });
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
