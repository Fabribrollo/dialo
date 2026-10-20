import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';

const context = vi.hoisted(() => ({ revision: 0, removed: new Set() }));
vi.mock('../context/CommunitiesContext.jsx', () => ({ useCommunities: () => context }));
let load;
beforeEach(() => { context.revision = 0; context.removed = new Set(); load = vi.fn(); });
it('al cambiar de comunidad descarta integrantes o invitaciones de la consulta anterior', async () => {
  let first;
  load.mockImplementation((id) => id === 1 ? new Promise((r) => { first = r; }) : Promise.resolve({ items: [{ id: 2 }] }));
  const { result, rerender } = renderHook(({ id }) => useCommunityCollection(id, load), { initialProps: { id: 1 } });
  rerender({ id: 2 });
  await waitFor(() => expect(result.current.items).toEqual([{ id: 2 }]));
  await act(async () => first({ items: [{ id: 1 }] }));
  expect(result.current.items).toEqual([{ id: 2 }]);
});
it('perder la autorización oculta la lista y descarta la respuesta pendiente', async () => {
  let resolve;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result, rerender } = renderHook(({ allowed }) => useCommunityCollection(1, load, allowed), { initialProps: { allowed: true } });
  rerender({ allowed: false });
  await act(async () => resolve({ items: [{ codigo: 'privado' }] }));
  expect(result.current.items).toEqual([]);
});
it('un 403 al recargar retira los códigos previamente cargados', async () => {
  load.mockResolvedValue({ items: [{ codigo: 'privado' }] });
  const { result } = renderHook(() => useCommunityCollection(1, load));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  load.mockRejectedValue({ status: 403, message: 'Sin permiso' });
  await act(async () => result.current.reload());
  expect(result.current.items).toEqual([]);
  expect(result.current.error.message).toBe('Sin permiso');
});
it('una consulta tardía no restaura una invitación revocada por una mutación local', async () => {
  let resolve;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = renderHook(() => useCommunityCollection(1, load));
  act(() => result.current.mutate(() => [{ id: 1, estado: 'REVOCADA' }]));
  await act(async () => resolve({ items: [{ id: 1, estado: 'ACTIVA' }] }));
  expect(result.current.items[0].estado).toBe('REVOCADA');
});
