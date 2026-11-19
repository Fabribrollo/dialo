import { useRef, useState } from 'react';
import { api } from '../services/api.js';

import { Link, useLocation } from 'react-router';
import Field, { PasswordField } from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import AuthError from '../components/AuthError.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';
import { invitationReturnPath, pendingInvitation } from '../utils/invitations.js';

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

export default function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const from = invitationReturnPath(location.state?.from) || pendingInvitation();
  const { submit, enviando, error, errorDe } = useSubmit(register);
  const checking = useRef(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState({ correo: '', contrasena: '', nombreUsuario: '', nombreVisible: '' });
  const [errores, setErrores] = useState({});
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    if (paso === 0) {
      const e = {
        correo: correoValido(datos.correo.trim()) ? '' : 'Ingresá un correo válido.',
        contrasena: datos.contrasena.length >= 8 ? '' : 'Tiene que tener al menos 8 caracteres.',
      };
      setErrores(e);
      if (!e.correo && !e.contrasena && !checking.current) {
        checking.current = true; setCheckingEmail(true); setEmailError('');
        const correo = datos.correo.trim().toLowerCase();
        try {
          const result = await api.post('/auth/email-availability', { correo });
          if (result.disponible) setPaso(1);
          else setErrores((old) => ({ ...old, correo: 'Ese correo ya tiene cuenta.' }));
        } catch (error) { setEmailError(error.message); }
        finally { checking.current = false; setCheckingEmail(false); }
      }
      return;
    }
    await submit(datos);
  }

  const errorCorreo = error?.code === 'EMAIL_TAKEN' ? 'Ese correo ya tiene cuenta.' : errorDe('correo');
  const errorUsuario = error?.code === 'USERNAME_TAKEN' ? 'Ese usuario ya está en uso' : errorDe('nombreUsuario');
  const mostrarPaso = errorCorreo || errorDe('contrasena') ? 0 : paso;

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-head">
        <h1>Creá tu cuenta</h1>
        {from && <span className="auth-sub">Creá tu cuenta para consultar la invitación.</span>}
      </div>
      {!['EMAIL_TAKEN', 'USERNAME_TAKEN'].includes(error?.code) && <AuthError error={error} />}
      {emailError && <p role="alert">{emailError}</p>}
      <div className="auth-fields">
        {mostrarPaso === 0 ? (
          <>
            <Field className="fld-lg" label="Correo" disabled={checkingEmail} type="email" autoComplete="email" value={datos.correo} onChange={cambiar('correo')} error={errores.correo || errorCorreo} />
            <PasswordField className="fld-lg" label="Contraseña" disabled={checkingEmail} autoComplete="new-password" value={datos.contrasena} onChange={cambiar('contrasena')} error={errores.contrasena || errorDe('contrasena')} />
          </>
        ) : (
          <>
            <Field className="fld-lg" label="Nombre de usuario" autoComplete="username" value={datos.nombreUsuario} onChange={cambiar('nombreUsuario')} error={errorUsuario} />
            <Field className="fld-lg" label="Nombre visible" autoComplete="name" value={datos.nombreVisible} onChange={cambiar('nombreVisible')} error={errorDe('nombreVisible')} />
          </>
        )}
      </div>
      <Button type="submit" className="auth-submit" loading={enviando || checkingEmail}>
        {mostrarPaso === 0 ? 'Siguiente' : enviando ? 'Creando tu cuenta…' : 'Registrarme'}
      </Button>
      {mostrarPaso === 1 && <Button variant="secundario" onClick={() => setPaso(0)}>Volver</Button>}
      <span className="auth-alt">¿Ya tenés cuenta? <Link className="lnk lnk-primario" to="/login" state={from ? { from } : undefined}>Iniciá sesión</Link></span>
    </form>
  );
}
