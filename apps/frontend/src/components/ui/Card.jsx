import './card.css';

export default function Card({ as: Tag = 'div', className = '', children, ...props }) {
  return <Tag className={`card ${className}`} {...props}>{children}</Tag>;
}

export function ListRow({ as: Tag = 'div', className = '', children, ...props }) {
  return <Tag className={`li ${className}`} {...props}>{children}</Tag>;
}

export function RowText({ title, children }) {
  return (
    <span className="li-text">
      <span className="li-title">{title}</span>
      {children && <span className="li-sub">{children}</span>}
    </span>
  );
}
