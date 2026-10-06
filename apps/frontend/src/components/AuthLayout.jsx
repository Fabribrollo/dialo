import { Link, Outlet } from "react-router";
import Icon from "./Icon.jsx";
export default function AuthLayout() {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link to="/login" className="wordmark">
          <span className="brand-mark">
            <Icon name="star" />
          </span>
          dialo<span className="brand-dot">.</span>
        </Link>
        <div className="auth-copy">
          <h1>
            Mensajería
            <br />
            <span>privada.</span>
          </h1>
          <p>Conversaciones, contactos y gestión de tu cuenta en Dialo.</p>
        </div>
      </section>
      <section className="auth-form">
        <Link className="mobile-brand" to="/login">
          dialo.
        </Link>
        <Outlet />
      </section>
    </main>
  );
}
