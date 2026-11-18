import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import Field, { PasswordField } from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import AuthError from '../components/AuthError.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';
import { invitationReturnPath, pendingInvitation } from '../utils/invitations.js';

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const from = invitationReturnPath(location.state?.from) || pendingInvitation();
  const { submit, enviando, error, errorDe } = useSubmit(login);
  const [vacios, setVacios] = useState({});

  function onSubmit(event) {
    event.preventDefault();
    const datos = Object.fromEntries(new FormData(event.target));
    const faltan = {
      identificador: datos.identificador.trim() ? '' : 'Ingresá tu usuario o tu correo.',
      contrasena: datos.contrasena ? '' : 'Ingresá tu contraseña.',
    };
    setVacios(faltan);
    if (faltan.identificador || faltan.contrasena) return;
    submit(datos);
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-head">
        <h1>Iniciá sesión</h1>
        <span className="auth-sub">{from ? 'Iniciá sesión para consultar la invitación.' : 'Qué bueno verte de nuevo.'}</span>
      </div>
      <AuthError error={error} />
      <div className="auth-fields">
        <Field className="fld-lg" label="Usuario o correo" name="identificador" autoComplete="username" placeholder="tuusuario o tucorreo@correo.com" error={vacios.identificador || errorDe('identificador')} />
        <PasswordField className="fld-lg" label="Contraseña" name="contrasena" autoComplete="current-password" placeholder="Tu contraseña" error={vacios.contrasena || errorDe('contrasena')} />
      </div>
      <div className="auth-forgot"><Link className="lnk auth-ink" to="/forgot-password">Olvidé mi contraseña</Link></div>
      <Button type="submit" className="auth-submit" loading={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Button>
      <span className="auth-alt">¿No tenés cuenta? <Link className="lnk lnk-primario" to="/register" state={from ? { from } : undefined}>Registrate</Link></span>
    </form>
  );
}