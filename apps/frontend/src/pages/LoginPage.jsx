import { Link, useLocation } from 'react-router';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';
import { invitationReturnPath, pendingInvitation } from '../utils-invitations.js';

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const from = invitationReturnPath(location.state?.from) || pendingInvitation();
  const { submit, enviando, error, errorDe } = useSubmit(login);

  function onSubmit(event) {
    event.preventDefault();
    submit(Object.fromEntries(new FormData(event.target)));
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Iniciar sesión</h1>
      {from && <p className="community-help">Iniciá sesión para consultar la invitación.</p>}
      {error && (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      )}
      <FormField
        label="Usuario o correo"
        name="identificador"
        autoComplete="username"
        required
        error={errorDe('identificador')}
      />
      <FormField
        label="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="current-password"
        required
        error={errorDe('contrasena')}
      />
      <button disabled={enviando}>Entrar</button>
      <p>
        <Link to="/forgot-password">Olvidé mi contraseña</Link>
      </p>
      <p>
        ¿No tenés cuenta? <Link to="/register" state={from ? { from } : undefined}>Registrate</Link>
      </p>
    </form>
  );
}
