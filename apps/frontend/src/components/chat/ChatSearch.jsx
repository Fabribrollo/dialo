import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import SearchInput from '../ui/SearchInput.jsx';
import './chatSearch.css';

export function filterMessages(messages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((m) => !m.eliminado && m.contenido?.toLowerCase().includes(q));
}

export default function ChatSearch({ value, onChange }) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    onChange('');
  }

  if (!open) {
    return (
      <button type="button" className="lg pr ib chs-btn" aria-label="Buscar en el chat" onClick={() => setOpen(true)}>
        <Icon name="buscar" size={18} stroke={2} />
      </button>
    );
  }

  return (
    <div className="chs">
      <SearchInput label="Buscar en el chat" placeholder="Buscar" autoFocus value={value}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') close(); }} />
      <button type="button" className="lg pr ib chs-btn" aria-label="Cerrar búsqueda" onClick={close}>
        <Icon name="cerrar" size={17} stroke={2.2} />
      </button>
    </div>
  );
}
