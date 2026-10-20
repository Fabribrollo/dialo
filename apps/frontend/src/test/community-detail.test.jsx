import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCommunity } from '../hooks/useCommunity.js';
import { getCommunity } from '../services/communitiesService.js';

const context = vi.hoisted(() => ({ revision: 0, removed: new Set() }));
vi.mock('../context/CommunitiesContext.jsx', () => ({ useCommunities: () => context }));
vi.mock('../services/communitiesService.js', () => ({ getCommunity: vi.fn() }));
beforeEach(() => { context.revision = 0; context.removed = new Set(); getCommunity.mockReset(); });

it('cambiar rápidamente de comunidad descarta la respuesta anterior', async () => {
  let first;
  getCommunity.mockImplementation((id) => id === 1 ? new Promise((r) => { first = r; }) : Promise.resolve({ comunidad: { id: 2, nombre: 'Segunda' } }));
  const { result, rerender } = renderHook(({ id }) => useCommunity(id), { initialProps: { id: 1 } });
  rerender({ id: 2 });
  await waitFor(() => expect(result.current.comunidad?.id).toBe(2));
  await act(async () => first({ comunidad: { id: 1, nombre: 'Primera' } }));
  expect(result.current.comunidad.id).toBe(2);
});
it('una actualización remota impide que un detalle pendiente restaure datos anteriores', async () => {
  let first;
  getCommunity.mockReturnValueOnce(new Promise((r) => { first = r; })).mockResolvedValue({ comunidad: { id: 1, nombre: 'Nueva' } });
  const { result, rerender } = renderHook(() => useCommunity(1));
  context.revision++;
  rerender();
  await waitFor(() => expect(result.current.comunidad?.nombre).toBe('Nueva'));
  await act(async () => first({ comunidad: { id: 1, nombre: 'Anterior' } }));
  expect(result.current.comunidad.nombre).toBe('Nueva');
});
it('perder acceso oculta inmediatamente el detalle y bloquea una respuesta tardía', async () => {
  let first;
  getCommunity.mockReturnValueOnce(new Promise((r) => { first = r; }));
  const { result, rerender } = renderHook(() => useCommunity(1));
  context.removed = new Set([1]);
  rerender();
  await act(async () => first({ comunidad: { id: 1, nombre: 'No disponible' } }));
  expect(result.current.lost).toBe(true);
  expect(result.current.comunidad).toBeNull();
});
