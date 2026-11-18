import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../components/ui/Dialog.jsx';

it('solo deja confirmar cuando se escribe el nombre exacto', () => {
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog open title="¿Transferir?" confirmLabel="Transferir propiedad" confirmText="Taller de Redes" onConfirm={onConfirm} onCancel={() => {}} />,
  );
  const boton = screen.getByRole('button', { name: 'Transferir propiedad', hidden: true });
  expect(boton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Escribí «Taller de Redes» para confirmar'), { target: { value: 'Taller de Redes' } });
  expect(boton).toBeEnabled();
  fireEvent.click(boton);
  expect(onConfirm).toHaveBeenCalledOnce();
});
