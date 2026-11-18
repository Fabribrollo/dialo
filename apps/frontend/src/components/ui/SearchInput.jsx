import './field.css';

export default function SearchInput({ label, className = '', ...props }) {
  return (
    <label className={`inp srch ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      <input type="text" aria-label={label} {...props} />
    </label>
  );
}
