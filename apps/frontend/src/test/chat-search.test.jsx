import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ChatSearch, { filterMessages } from '../components/chat/ChatSearch.jsx';

const mensajes = [
  { id: 1, contenido: 'Mañana llevo el cable' },
  { id: 2, contenido: 'Hola' },
  { id: 3, contenido: 'otro CABLE', eliminado: false },
  { id: 4, contenido: 'cable borrado', eliminado: true },
];

it('filtra los mensajes cargados sin importar mayúsculas y saltea los eliminados', () => {
  expect(filterMessages(mensajes, '  ').map((m) => m.id)).toEqual([1, 2, 3, 4]);
  expect(filterMessages(mensajes, 'cable').map((m) => m.id)).toEqual([1, 3]);
});

function Demo() {
  const [q, setQ] = useState('');
  return <><ChatSearch value={q} onChange={setQ} /><p>{q || 'vacío'}</p></>;
}

it('abre con la lupa y Escape la cierra y limpia', () => {
  render(<Demo />);
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en la conversación' }));
  const input = screen.getByLabelText('Buscar en la conversación');
  fireEvent.change(input, { target: { value: 'cable' } });
  expect(screen.getByText('cable')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByText('vacío')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Buscar en la conversación' })).toBeInTheDocument();
});
