import { useState } from 'react';
import { Link } from 'react-router';
import Field from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import AuthError from '../components/AuthError.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const { submit, enviando, error, errorDe } = useSubmit(forgotPassword);
  const [enviado, setEnviado] = useState(false);
  const [invalido, setInvalido] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    const datos = Object.fromEntries(new FormData(event.target));
    if (!correoValido(datos.correo.trim())) return setInvalido('Ingresá un correo válido.');
    setInvalido('');
    if (await submit(datos)) setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="auth-form">
        <span className="auth-badge"><Icon name="correo" size={30} stroke={1.8} /></span>
        <div className="auth-head auth-center">
          <h1 className="auth-h1-sm">Revisá tu correo</h1>
          <span className="auth-sub" role="status">Si el correo está registrado, te enviamos un enlace para elegir una contraseña nueva. Vence en 1 hora.</span>
        </div>
        <span className="auth-alt"><Link className="lnk auth-ink" to="/login">Volver a iniciar sesión</Link></span>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-head">
        <h1>Recuperá tu contraseña</h1>
        <span className="auth-sub">Te mandamos un enlace para crear una nueva.</span>
      </div>
      <AuthError error={error} rateLimitText="Esperá unos minutos antes de pedir otro enlace." />
      <Field className="fld-lg" label="Correo" name="correo" type="email" autoComplete="email" error={invalido || errorDe('correo')} />
      <Button type="submit" className="auth-submit" loading={enviando}>Enviar enlace</Button>
      <span className="auth-alt"><Link className="lnk auth-ink" to="/login">Volver a iniciar sesión</Link></span>
    </form>
  );
}
