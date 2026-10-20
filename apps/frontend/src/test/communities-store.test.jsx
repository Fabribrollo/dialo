import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CommunitiesProvider, useCommunities } from '../context/CommunitiesContext.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { getCommunities } from '../services/communitiesService.js';

vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../services/communitiesService.js', () => ({ getCommunities: vi.fn() }));
const community = { id: 4, nombre: 'Club', miRol: 'ADMIN', tipo: 'PRIVADA', cantidadIntegrantes: 2 };
let listeners;
function fire(event, data) { act(() => listeners.get(event)?.forEach((fn) => fn(data))); }
beforeEach(() => {
  listeners = new Map();
  useSocket.mockReturnValue({
    on: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
    off: (event, fn) => listeners.get(event)?.delete(fn),
  });
  getCommunities.mockReset().mockResolvedValue({ items: [community] });
});
it('unifica respuesta local y community:new sin duplicar y conserva el rol ante un evento público', async () => {
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.remember(community));
  fire('community:new', { comunidad: community });
  expect(result.current.items).toHaveLength(1);
  fire('community:updated', { comunidad: { id: 4, nombre: 'Actualizada' } });
  expect(result.current.items[0]).toMatchObject({ nombre: 'Actualizada', miRol: 'ADMIN' });
});
it('una respuesta de listado anterior no restaura una comunidad eliminada', async () => {
  let resolve;
  getCommunities.mockReturnValueOnce(new Promise((r) => { resolve = r; })).mockResolvedValue({ items: [] });
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  fire('community:deleted', { idComunidad: 4 });
  await act(async () => resolve({ items: [community] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items).toEqual([]);
  expect(result.current.removed.has(4)).toBe(true);
});
it('reconsulta el listado si una mutación local gana a la consulta pendiente', async () => {
  let resolve;
  getCommunities.mockReturnValueOnce(new Promise((r) => { resolve = r; })).mockResolvedValue({ items: [] });
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  act(() => result.current.forget(4));
  await act(async () => resolve({ items: [community] }));
  await waitFor(() => expect(getCommunities).toHaveBeenCalledTimes(2));
  expect(result.current.items).toEqual([]);
});
it('reconexión y membresías recuperan datos desde HTTP y se limpian los listeners', async () => {
  const { result, unmount } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  getCommunities.mockResolvedValue({ items: [{ ...community, cantidadIntegrantes: 3 }] });
  fire('community:member-joined', { idComunidad: 4 });
  await waitFor(() => expect(result.current.items[0].cantidadIntegrantes).toBe(3));
  fire('connect');
  await waitFor(() => expect(getCommunities).toHaveBeenCalledTimes(3));
  unmount();
  expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
});
it('abandono retira el espacio y un nuevo ingreso permite recordarlo otra vez', async () => {
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  getCommunities.mockResolvedValue({ items: [] });
  fire('community:left', { idComunidad: 4 });
  expect(result.current.items).toEqual([]);
  expect(result.current.removed.has(4)).toBe(true);
  act(() => result.current.remember(community));
  expect(result.current.removed.has(4)).toBe(false);
});
it('un error permite reintentar sin presentar un vacío exitoso', async () => {
  getCommunities.mockRejectedValueOnce(new Error('Sin conexión'));
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  await waitFor(() => expect(result.current.error).toBe('Sin conexión'));
  await act(async () => result.current.reload());
  expect(result.current.error).toBe('');
  expect(result.current.items).toHaveLength(1);
});

it('reconectar recupera una membresía obtenida mientras no llegaban eventos', async () => {
  const { result } = renderHook(useCommunities, { wrapper: CommunitiesProvider });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  getCommunities.mockResolvedValue({ items: [] });
  fire('community:left', { idComunidad: 4 });
  await waitFor(() => expect(result.current.items).toHaveLength(0));
  getCommunities.mockResolvedValue({ items: [community] });
  fire('connect');
  await waitFor(() => expect(result.current.removed.has(4)).toBe(false));
  expect(result.current.items).toHaveLength(1);
});
