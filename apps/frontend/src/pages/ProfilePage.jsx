import ProfileForm from '../components/ProfileForm.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function ProfilePage() {
  const { logout } = useAuth();

  return (
    <div className="card">
      <h1>Mi perfil</h1>
      <ProfileForm />
      <button onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
