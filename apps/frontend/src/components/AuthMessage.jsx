export default function AuthMessage({ icon, title, children, actions }) {
  return (
    <div className="auth-msg" role="status">
      <span className="auth-msg-icon">{icon}</span>
      <b>{title}</b>
      <span className="auth-msg-text">{children}</span>
      <div className="auth-msg-actions">{actions}</div>
    </div>
  );
}

export const linkIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
