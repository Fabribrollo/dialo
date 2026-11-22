import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {useCommunityActivity} from '../hooks/useCommunityActivity.js';
const m=vi.hoisted(()=>({get:vi.fn()}));vi.mock('../services/api.js',()=>({api:{get:m.get}}));
function socket(){const handlers={};return {on:(e,f)=>{handlers[e]=f;},off:vi.fn(),emit:(e,p)=>handlers[e]?.(p)};}
beforeEach(()=>{m.get.mockReset().mockResolvedValue({participantes:0,ultimoMensaje:null,llamada:null});});
test('rerender de la lista no repite consultas y una ráfaga reconsulta solo la comunidad afectada',async()=>{
 const s=socket(),items=[{id:1},{id:2}];const view=renderHook(({rows})=>useCommunityActivity(rows,s),{initialProps:{rows:items}});await waitFor(()=>expect(m.get).toHaveBeenCalledTimes(2));view.rerender({rows:[{id:1},{id:2}]});expect(m.get).toHaveBeenCalledTimes(2);
 act(()=>{s.emit('community:activity-changed',{idComunidad:2});s.emit('community:activity-changed',{idComunidad:2});s.emit('channel:updated',{canal:{idComunidad:2}});});await waitFor(()=>expect(m.get).toHaveBeenCalledTimes(3));expect(m.get.mock.calls[2][0]).toBe('/communities/2/activity');view.unmount();
});
test('una revocación invalida la respuesta anterior antes de mostrar contenido',async()=>{
 let resolve;const s=socket();m.get.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const view=renderHook(()=>useCommunityActivity([{id:1}],s));act(()=>s.emit('channel:access-lost',{idComunidad:1}));await act(async()=>resolve({ultimoMensaje:{canal:'secreto',contenido:'texto revocado'}}));expect(view.result.current.activity[1]).not.toContain('revocado');await waitFor(()=>expect(m.get).toHaveBeenCalledTimes(2));view.unmount();
});
