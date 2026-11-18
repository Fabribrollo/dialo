import Icon from './Icon.jsx';
import { LinkButton } from './Button.jsx';
import './notice.css';

const tones = {
  error: { icon: 'error', size: 18, stroke: 2.1, role: 'alert' },
  exito: { icon: 'check', size: 17, stroke: 2.6, role: 'status' },
  conflicto: { icon: 'info', size: 18, stroke: 2.1, role: 'status' },
  espera: { icon: 'reloj', size: 18, stroke: 2.1, role: 'status' },
};

export default function Notice({ tone = 'error', title, children, actionLabel, onAction, role: roleProp }) {
  const { icon, size, stroke, role } = tones[tone];
  return (
    <div className={`tl tl-${tone}`} role={roleProp ?? role}>
      <span className="tli"><Icon name={icon} size={size} stroke={stroke} /></span>
      <span className="tl-body">
        <span className="tl-title">{title}</span>
        {children && <span className="tl-text">{children}</span>}
        {actionLabel && <LinkButton variant="secundario" className="tl-action" onClick={onAction}>{actionLabel}</LinkButton>}
      </span>
    </div>
  );
}
