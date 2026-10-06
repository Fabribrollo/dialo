import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { resetPassword } = useAuth();
  const { submit, enviando, error, errorDe } = useSubmit(resetPassword);
  const [listo, setListo] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const { contrasena } = Object.fromEntries(new FormData(event.target));
    if (await submit({ token, contrasena })) setListo(true);
  }

  if (listo) {
    return (
      <div className="card">
        <h1>Contraseña actualizada</h1>
        <p role="status">Ya podés entrar con tu contraseña nueva.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="card">
        <h1>Enlace inválido</h1>
        <p>Al enlace le falta el token. Pedí uno nuevo.</p>
        <p>
          <Link to="/forgot-password">Recuperar contraseña</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Elegí una contraseña nueva</h1>
      {error && (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      )}
      <FormField
        label="Contraseña nueva"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        error={errorDe('contrasena')}
      />
      <button disabled={enviando}>Guardar contraseña</button>
      {error?.code === 'INVALID_TOKEN' && (
        <p>
          <Link to="/forgot-password">Pedir un enlace nuevo</Link>
        </p>
      )}
    </form>
  );
}
