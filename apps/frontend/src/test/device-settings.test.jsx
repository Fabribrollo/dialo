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
test('consultar dispositivos no solicita capturar audio o cámara',async()=>{
  show();fireEvent.click(screen.getByText('Consultar dispositivos'));await screen.findByText('Micrófono USB');expect(mock.capture).not.toHaveBeenCalled();
});
test('volver al predeterminado actualiza también la llamada activa',async()=>{
  show();fireEvent.change(screen.getByLabelText('Micrófono'),{target:{value:''}});fireEvent.click(screen.getByText('Guardar preferencias'));await screen.findByText('Preferencias guardadas.');expect(mock.select).toHaveBeenCalledWith('audioinput','default');expect(mock.patch).toHaveBeenCalledWith('/users/me/preferences',expect.objectContaining({audioInput:''}));
});
test('un dispositivo no disponible no oculta que las preferencias ya fueron guardadas',async()=>{
  mock.select.mockRejectedValue(new Error('No disponible'));show();fireEvent.click(screen.getByText('Guardar preferencias'));await waitFor(()=>expect(mock.setUsuario).toHaveBeenCalled());expect(await screen.findByRole('status')).toHaveTextContent('Preferencias guardadas. No se pudo cambiar');
});
