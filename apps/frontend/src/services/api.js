import { API_URL, DEV_USER_ID } from '../constants/api.js';

export class ApiError extends Error {
  constructor(status, { code, message, details, retryAfter } = {}) {
    super(message || 'Error inesperado');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
    this.retryAfter = retryAfter;
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
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

// XHR expone progreso real de subida y cancelación; mantiene el contrato ApiError.
api.upload=(path,body,{signal,onProgress}={})=>new Promise((resolve,reject)=>{
 const xhr=new XMLHttpRequest();
 const done=()=>signal?.removeEventListener('abort',abort);
 const abort=()=>xhr.abort();
 xhr.open('POST',`${API_URL}${path}`);xhr.withCredentials=true;xhr.timeout=120000;
 if(DEV_USER_ID)xhr.setRequestHeader('x-dev-user-id',DEV_USER_ID);
 xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round(e.loaded/e.total*100));};
 xhr.onload=()=>{done();let data;try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new ApiError(xhr.status,data?.error));};
 xhr.onerror=()=>{done();reject(new ApiError(0,{code:'NETWORK_ERROR',message:'Se perdió la conexión. Podés reintentar este mismo envío.'}));};
 xhr.ontimeout=()=>{done();reject(new ApiError(0,{code:'UPLOAD_TIMEOUT',message:'El envío tardó demasiado. Podés reintentarlo.'}));};
 xhr.onabort=()=>{done();reject(new DOMException('Envío cancelado','AbortError'));};
 if(signal?.aborted){reject(new DOMException('Envío cancelado','AbortError'));return;}
 signal?.addEventListener('abort',abort,{once:true});xhr.send(body);
});
