import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import RegisterPage from '../pages/RegisterPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
const mock=vi.hoisted(()=>({post:vi.fn(),patch:vi.fn(),delete:vi.fn(),setUsuario:vi.fn(),register:vi.fn(),login:vi.fn(),user:{id:1,nombreVisible:'Ana',nombreUsuario:'ana',fotoUrl:'https://example.test/ana.png',disponibilidad:'EN_LINEA',colorAvatar:'#756222'}}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:mock.user,setUsuario:mock.setUsuario,register:mock.register,login:mock.login,avisoSesion:'La sesión terminó o se cerró desde otra pestaña. Volvé a iniciar sesión.'})}));
vi.mock('../services/api.js',()=>({api:{post:mock.post,patch:mock.patch,delete:mock.delete}}));
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();});
function firstStep(){render(<MemoryRouter><RegisterPage/></MemoryRouter>);fireEvent.change(screen.getByLabelText('Correo'),{target:{value:'ana@example.test'}});fireEvent.change(screen.getByLabelText('Contraseña'),{target:{value:'Clave12345'}});fireEvent.click(screen.getByText('Siguiente'));}
test('correo ya registrado no avanza ni crea una cuenta',async()=>{
  mock.post.mockResolvedValue({disponible:false});firstStep();await screen.findByText('Ese correo ya tiene cuenta.');expect(screen.queryByLabelText('Nombre de usuario')).not.toBeInTheDocument();expect(mock.register).not.toHaveBeenCalled();
});
test('un error al comprobar el correo permite reintentar sin perder lo escrito',async()=>{
  mock.post.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({disponible:true});firstStep();await screen.findByText('Sin conexión');expect(screen.getByLabelText('Correo')).toHaveValue('ana@example.test');fireEvent.click(screen.getByText('Siguiente'));await screen.findByLabelText('Nombre de usuario');
});
test('la consulta pendiente impide cambiar el correo validado',async()=>{
  let resolve;mock.post.mockReturnValue(new Promise(r=>{resolve=r;}));firstStep();expect(screen.getByLabelText('Correo')).toBeDisabled();await act(async()=>resolve({disponible:true}));await screen.findByLabelText('Nombre de usuario');
});
test('quitar la foto actualiza el perfil con la respuesta del servidor',async()=>{
  mock.delete.mockResolvedValue({usuario:{...mock.user,fotoUrl:null}});render(<ProfileForm/>);fireEvent.click(screen.getByText('Quitar foto'));await waitFor(()=>expect(mock.setUsuario).toHaveBeenCalledWith(expect.objectContaining({fotoUrl:null})));expect(mock.delete).toHaveBeenCalledWith('/users/me/foto');
});
test('el nombre inválido no se envía y el color elegido se persiste con los datos válidos',async()=>{
  mock.patch.mockResolvedValue({usuario:{...mock.user,colorAvatar:'#156B64'}});render(<ProfileForm/>);fireEvent.change(screen.getByLabelText('Nombre visible'),{target:{value:'x'}});fireEvent.click(screen.getByText('Guardar cambios'));await screen.findByText('Tiene que tener entre 2 y 40 caracteres.');expect(mock.patch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Nombre visible'),{target:{value:'Ana'}});fireEvent.change(screen.getByLabelText('Color del avatar'),{target:{value:'#156B64'}});fireEvent.click(screen.getByText('Guardar cambios'));await waitFor(()=>expect(mock.patch).toHaveBeenCalledWith('/users/me',expect.objectContaining({colorAvatar:'#156B64',nombreVisible:'Ana'})));
});
test('el acceso explica el cierre de sesión remoto',()=>{
  render(<MemoryRouter><LoginPage/></MemoryRouter>);expect(screen.getByRole('status')).toHaveTextContent('La sesión terminó');
});
