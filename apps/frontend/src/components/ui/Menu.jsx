import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import './menu.css';

export default function Menu({ open, onClose, label, className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    function onDown(e) { if (!ref.current?.contains(e.target)) onClose?.(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return <div ref={ref} role="menu" aria-label={label} className={`lg menu ${className}`}>{children}</div>;
}

export function MenuLabel({ children }) {
  return <span className="lbl menu-lbl">{children}</span>;
}

export function MenuItem({ selected = false, children, ...props }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} className="mi" {...props}>
      {children}
      {selected && <span className="mi-check"><Icon name="check" size={16} stroke={2.6} /></span>}
    </button>
  );
}
