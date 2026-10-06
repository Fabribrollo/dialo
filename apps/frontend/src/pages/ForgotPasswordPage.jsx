import { useState } from 'react';
import { Link } from 'react-router';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const { submit, enviando, error, errorDe } = useSubmit(forgotPassword);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (await submit(Object.fromEntries(new FormData(event.target)))) setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="card">
        <h1>Revisá tu correo</h1>
        <p role="status">Si el correo está registrado, te enviamos un enlace para elegir una contraseña nueva. Vence en 1 hora.</p>
        <p>
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Recuperar contraseña</h1>
      {error && (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      )}
      <FormField label="Correo" name="correo" type="email" autoComplete="email" required error={errorDe('correo')} />
      <button disabled={enviando}>Enviar enlace</button>
      <p>
        <Link to="/login">Volver a iniciar sesión</Link>
      </p>
    </form>
  );
}
