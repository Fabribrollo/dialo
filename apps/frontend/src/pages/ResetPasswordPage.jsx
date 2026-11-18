import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PasswordField } from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import AuthError from '../components/AuthError.jsx';
import AuthMessage, { linkIcon } from '../components/AuthMessage.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';

function pedirOtro(navigate) {
  return <Button size="sm" onClick={() => navigate('/forgot-password')}>Pedir un enlace nuevo</Button>;
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const { submit, enviando, error, errorDe } = useSubmit(resetPassword);
  const [listo, setListo] = useState(false);
  const [corta, setCorta] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    if (listo) return navigate('/login');
    const { contrasena } = Object.fromEntries(new FormData(event.target));
    if (contrasena.length < 8) return setCorta('Tiene que tener al menos 8 caracteres.');
    setCorta('');
    if (await submit({ token, contrasena })) setListo(true);
  }

  if (!token) {
    return (
      <AuthMessage icon={linkIcon} title="Enlace inválido" actions={pedirOtro(navigate)}>
        Al enlace le falta una parte. Pedí uno nuevo.
      </AuthMessage>
    );
  }
  if (error?.code === 'INVALID_TOKEN') {
    return (
      <AuthMessage icon={linkIcon} title="El enlace ya venció" actions={pedirOtro(navigate)}>
        El enlace no es válido o ya venció. Pedí uno nuevo, dura 1 hora.
      </AuthMessage>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-head">
        <h1>Elegí una contraseña nueva</h1>
        <span className="auth-sub">Que no la uses en otro lado.</span>
      </div>
      <AuthError error={error} />
      <PasswordField className="fld-lg" label="Contraseña nueva" name="contrasena" autoComplete="new-password" disabled={listo} error={corta || errorDe('contrasena')} />
      {listo && <Notice tone="exito" title="Contraseña actualizada" />}
      <Button type="submit" className="auth-submit" loading={enviando}>
        {enviando ? 'Guardando…' : listo ? 'Iniciar sesión' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}
