import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const RightPanelContext = createContext(null);

export default function RightPanel({ label, children }) {
  const slot = useContext(RightPanelContext);
  if (!slot) return null;
  return createPortal(<aside className="win shell-right" aria-label={label}>{children}</aside>, slot);
}
