import { act,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { useTyping } from '../hooks/useTyping.js';
const mock=vi.hoisted(()=>({connected:true,on:vi.fn(),off:vi.fn(),emit:vi.fn(),handlers:new Map()}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>mock}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:{id:1}})}));
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mock.connected=true;mock.handlers.clear();mock.on.mockImplementation((name,fn)=>mock.handlers.set(name,fn));});
afterEach(()=>vi.useRealTimers());
const packet=(extra={})=>({tipo:'canal',id:2,idUsuario:3,nombre:'Ana',escribiendo:true,hasta:Date.now()-10000,...extra});
test('un paquete demorado se muestra cinco segundos desde su recepción',()=>{
 const {result}=renderHook(()=>useTyping('canal',2));
 act(()=>mock.handlers.get('typing:updated')(packet()));expect(result.current.names).toBe('Ana');
 act(()=>vi.advanceTimersByTime(4500));expect(result.current.names).toBe('Ana');
 act(()=>vi.advanceTimersByTime(500));expect(result.current.names).toBe('');
});
test('solo muestra a otros usuarios del destino y un stop lo retira',()=>{
 const {result}=renderHook(()=>useTyping('canal',2));
 act(()=>{mock.handlers.get('typing:updated')(packet({id:99}));mock.handlers.get('typing:updated')(packet({idUsuario:1}));});expect(result.current.names).toBe('');
 act(()=>mock.handlers.get('typing:updated')(packet()));expect(result.current.names).toBe('Ana');
 act(()=>mock.handlers.get('typing:updated')(packet({escribiendo:false})));expect(result.current.names).toBe('');
});
test('envía al empezar, limita repeticiones y avisa al dejar de escribir',()=>{
 const {result}=renderHook(()=>useTyping('conversacion',4));
 act(()=>{result.current.typing('H');result.current.typing('Ho');});expect(mock.emit).toHaveBeenCalledTimes(1);
 expect(mock.emit).toHaveBeenLastCalledWith('typing:update',{tipo:'conversacion',id:4,escribiendo:true});
 act(()=>vi.advanceTimersByTime(3000));expect(mock.emit).toHaveBeenLastCalledWith('typing:update',{tipo:'conversacion',id:4,escribiendo:false});
});
test('vaciar el borrador envía stop y desconectar limpia la vista',()=>{
 const {result}=renderHook(()=>useTyping('canal',2));
 act(()=>{result.current.typing('texto');result.current.typing('');});expect(mock.emit).toHaveBeenLastCalledWith('typing:update',{tipo:'canal',id:2,escribiendo:false});
 act(()=>mock.handlers.get('typing:updated')(packet()));
 act(()=>mock.handlers.get('disconnect')());expect(result.current.names).toBe('');
});
test('cambiar de destino reinicia el envío y desmontar retira listeners',()=>{
 const {result,rerender,unmount}=renderHook(({id})=>useTyping('canal',id),{initialProps:{id:2}});
 act(()=>result.current.typing('uno'));rerender({id:3});act(()=>result.current.typing('dos'));
 expect(mock.emit).toHaveBeenLastCalledWith('typing:update',{tipo:'canal',id:3,escribiendo:true});
 unmount();expect(mock.emit).toHaveBeenLastCalledWith('typing:update',{tipo:'canal',id:3,escribiendo:false});expect(mock.off).toHaveBeenCalledWith('typing:updated',expect.any(Function));
});
