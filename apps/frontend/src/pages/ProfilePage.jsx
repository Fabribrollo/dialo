import ProfileForm from "../components/ProfileForm.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function ProfilePage() {
  const { logout } = useAuth();

  return (
    <section className="page-container profile-page">
      <header className="page-heading">
        <h1>Mi perfil</h1>
        <p>Actualizá tu foto, tus datos y tu disponibilidad.</p>
      </header>
      <div className="card profile-card">
        <ProfileForm />
        <button className="secondary" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}
