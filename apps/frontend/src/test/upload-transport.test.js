import {afterEach,expect,test,vi} from 'vitest';
import {api} from '../services/api.js';
afterEach(()=>vi.unstubAllGlobals());
test('upload usa credenciales, progreso y AbortSignal sin perder el error de cancelación',async()=>{
 let xhr;class Fake{constructor(){xhr=this;this.upload={};}open=vi.fn();setRequestHeader=vi.fn();send=vi.fn();abort=()=>this.onabort();}
 vi.stubGlobal('XMLHttpRequest',Fake);const controller=new AbortController(),progress=vi.fn();const promise=api.upload('/files/batch',new FormData(),{signal:controller.signal,onProgress:progress});expect(xhr.withCredentials).toBe(true);xhr.upload.onprogress({lengthComputable:true,loaded:5,total:10});expect(progress).toHaveBeenCalledWith(50);controller.abort();await expect(promise).rejects.toHaveProperty('name','AbortError');
});
test('upload transforma fallas HTTP al mismo ApiError que el transporte JSON',async()=>{
 let xhr;class Fake{constructor(){xhr=this;this.upload={};}open(){}setRequestHeader(){}send(){}}
 vi.stubGlobal('XMLHttpRequest',Fake);const promise=api.upload('/files/batch',new FormData());xhr.status=403;xhr.responseText=JSON.stringify({error:{code:'NO_WRITE_PERMISSION',message:'Sin permiso'}});xhr.onload();await expect(promise).rejects.toMatchObject({status:403,code:'NO_WRITE_PERMISSION'});
});
