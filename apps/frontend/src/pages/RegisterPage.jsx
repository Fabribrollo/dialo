import { Link } from 'react-router';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useSubmit } from '../hooks/useSubmit.js';

export default function RegisterPage() {
  const { register } = useAuth();
  const { submit, enviando, error, errorDe } = useSubmit(register);

  function onSubmit(event) {
    event.preventDefault();
    submit(Object.fromEntries(new FormData(event.target)));
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Crear cuenta</h1>
      {error && (
        <p role="alert" className="form-error">
          {error.message}
        </p>
      )}
      <FormField
        label="Nombre de usuario"
        name="nombreUsuario"
        autoComplete="username"
        required
        error={errorDe('nombreUsuario')}
      />
      <FormField label="Nombre visible" name="nombreVisible" autoComplete="name" required error={errorDe('nombreVisible')} />
      <FormField label="Correo" name="correo" type="email" autoComplete="email" required error={errorDe('correo')} />
      <FormField
        label="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        error={errorDe('contrasena')}
      />
      <button disabled={enviando}>Registrarme</button>
      <p>
        ¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link>
      </p>
    </form>
  );
}
