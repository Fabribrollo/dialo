import Icon from './Icon.jsx';
import Button from './Button.jsx';
import './emptyState.css';

export default function EmptyState({ icon, title, children, actionLabel, onAction }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} stroke={1.8} /></span>
      <span className="empty-title">{title}</span>
      {children && <span className="empty-text">{children}</span>}
      {actionLabel && <Button className="empty-action" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function Loading({ rows = 3 }) {
  const widths = [[46, 72], [38, 60], [52, 66]];
  return (
    <div className="sk-list" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk-row">
          <span className="sk sk-av" />
          <span className="sk-lines">
            <span className="sk" style={{ height: 12, width: `${widths[i % 3][0]}%` }} />
            <span className="sk" style={{ height: 10, width: `${widths[i % 3][1]}%` }} />
          </span>
        </span>
      ))}
    </div>
  );
}
