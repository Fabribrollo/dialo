import { Spinner } from './Icon.jsx';
import './button.css';

const variants = { primario: 'ac', secundario: 'lg', peligro: 'dg', oscuro: 'lg dk' };

export default function Button({ variant = 'primario', size, loading = false, disabled, className = '', children, type = 'button', ...props }) {
  const quieto = disabled || loading;
  return (
    <button type={type} className={`btn ${variants[variant]} ${size === 'sm' ? 'sm' : ''} ${quieto ? '' : 'pr'} ${className}`} disabled={disabled} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function IconButton({ variant = 'secundario', label, className = '', children, type = 'button', ...props }) {
  return (
    <button type={type} className={`ib ${variants[variant]} pr ${className}`} aria-label={label} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = 'primario', as: Tag = 'button', className = '', ...props }) {
  const extra = Tag === 'button' ? { type: 'button' } : {};
  return <Tag className={`lnk lnk-${variant} ${className}`} {...extra} {...props} />;
}
