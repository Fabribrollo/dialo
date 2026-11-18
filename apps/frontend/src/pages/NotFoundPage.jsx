import { useNavigate } from 'react-router';
import Button from '../components/ui/Button.jsx';
import '../styles/notFound.css';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="nf">
      <span aria-hidden="true" className="dsp nf-bg">404</span>
      <div className="nf-body">
        <span className="nf-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
        </span>
        <h1 className="dsp">No encontramos esta página</h1>
        <span className="nf-sub">El enlace puede estar roto o la página ya no existe.</span>
        <div className="nf-actions">
          <Button onClick={() => navigate('/')}>Ir a Mensajes</Button>
          <Button variant="secundario" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>
    </div>
  );
}
