import { Spinner } from '../ui/Icon.jsx';
import Button from '../ui/Button.jsx';
import './bootScreen.css';

export function Logo() {
  return (
    <svg width="34" height="22" viewBox="0 0 220 140" aria-hidden="true">
      <circle cx="80" cy="70" r="60" fill="#131316" />
      <circle cx="140" cy="70" r="60" style={{ fill: 'var(--acc)' }} />
      <path d="M110 18.04A60 60 0 0 1 110 121.96A60 60 0 0 1 110 18.04Z" fill="#fff" />
    </svg>
  );
}

export default function BootScreen({ children = 'Cargando…' }) {
  return (
    <div className="boot">
      <Logo />
      <span className="boot-msg" role="status"><Spinner size={17} />{children}</span>
    </div>
  );
}

export function BootError({ title, onRetry }) {
  return (
    <div className="boot" role="alert">
      <span className="boot-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.4-2.2M12 7.5c2.9 0 5.5 1.1 7.5 3" /><circle cx="12" cy="20" r=".8" />
        </svg>
      </span>
      <span className="boot-text">
        <b>{title}</b>
        <span>No pudimos comprobar tu ingreso.</span>
      </span>
      <Button size="sm" onClick={onRetry}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" /></svg>
        Reintentar
      </Button>
    </div>
  );
}
