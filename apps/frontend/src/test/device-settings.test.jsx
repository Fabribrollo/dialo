import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import DeviceSettings from '../components/DeviceSettings.jsx';
import { CallContext } from '../context/CallContext.jsx';
const mock=vi.hoisted(()=>({patch:vi.fn(),setUsuario:vi.fn(),select:vi.fn(),discover:vi.fn(),capture:vi.fn()}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:{id:1,preferencias:{audioInput:'anterior'}},setUsuario:mock.setUsuario})}));
vi.mock('../context/PrivateCallContext.jsx',()=>({usePrivateCall:()=>null}));
vi.mock('../services/api.js',()=>({api:{patch:mock.patch}}));
beforeEach(()=>{vi.clearAllMocks();mock.select.mockResolvedValue();mock.patch.mockResolvedValue({usuario:{id:1,preferencias:{audioInput:''}}});Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:mock.discover,getUserMedia:mock.capture}});mock.discover.mockResolvedValue([{deviceId:'uno',kind:'audioinput',label:'Micrófono USB'}]);});
const show=()=>render(<CallContext.Provider value={{elegirDispositivo:mock.select}}><DeviceSettings/></CallContext.Provider>);
test('solo muestra las dos opciones de notificaciones sin consultar dispositivos',()=>{
 show();expect(screen.getAllByRole('switch')).toHaveLength(2);expect(screen.queryByText('Dispositivos')).not.toBeInTheDocument();expect(screen.queryByText('Consultar dispositivos')).not.toBeInTheDocument();expect(mock.discover).not.toHaveBeenCalled();expect(mock.capture).not.toHaveBeenCalled();
});
test('silenciar se guarda al cambiar el control y conserva las preferencias previas',async()=>{
 show();fireEvent.click(screen.getByRole('switch',{name:/Desactivar notificaciones/}));await waitFor(()=>expect(mock.setUsuario).toHaveBeenCalled());expect(mock.patch).toHaveBeenCalledWith('/users/me/preferences',expect.objectContaining({silenciarNotificaciones:true,audioInput:'anterior'}));expect(screen.getByRole('switch',{name:/Desactivar notificaciones/})).toHaveAttribute('aria-checked','true');
});
test('si falla el guardado conserva el valor anterior y permite reintentar',async()=>{
 mock.patch.mockRejectedValueOnce(new Error('Sin conexión'));show();const toggle=screen.getByRole('switch',{name:/Desactivar notificaciones/});fireEvent.click(toggle);await screen.findByText('Sin conexión');expect(toggle).toHaveAttribute('aria-checked','false');expect(toggle).toBeEnabled();fireEvent.click(toggle);await waitFor(()=>expect(toggle).toHaveAttribute('aria-checked','true'));
});

test('avisos del navegador se configuran en ajustes y requieren autorización explícita',async()=>{
 const stored=new Map();
 const storage={
   getItem:vi.fn(key=>stored.get(key)??null),
   setItem:vi.fn((key,value)=>stored.set(key,String(value))),
 };
 const request=vi.fn(async()=>{Object.defineProperty(window.Notification,'permission',{configurable:true,value:'granted'});return 'granted';});
 // El almacenamiento de esta prueba no depende del localStorage nativo de Node.
 vi.stubGlobal('localStorage',storage);
 vi.stubGlobal('Notification',Object.assign(function(){},{permission:'default',requestPermission:request}));
 try {
   show();const toggle=screen.getByRole('switch',{name:/Avisos del navegador o sistema/});expect(request).not.toHaveBeenCalled();
   fireEvent.click(toggle);await waitFor(()=>expect(toggle).toHaveAttribute('aria-checked','true'));expect(request).toHaveBeenCalledOnce();
   expect(storage.setItem).toHaveBeenLastCalledWith('dialo:avisos-navegador','1');
   fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-checked','false');expect(mock.patch).not.toHaveBeenCalled();
   expect(storage.setItem).toHaveBeenLastCalledWith('dialo:avisos-navegador','0');
 } finally {
   vi.unstubAllGlobals();
 }
});
