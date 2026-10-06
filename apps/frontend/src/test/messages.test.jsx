import { beforeEach, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMessages } from "../hooks/useMessages.js";
import { getMessages } from "../services/conversationsService.js";
import { useSocket } from "../hooks/useSocket.js";
vi.mock("../services/conversationsService.js", () => ({
  getMessages: vi.fn(),
}));
vi.mock("../hooks/useSocket.js", () => ({ useSocket: vi.fn() }));
let listeners;
let socket;
const m = (id, extra = {}) => ({
  id,
  idConversacion: 3,
  idAutor: 1,
  fechaCreacion: `2026-10-06T00:00:0${id}Z`,
  contenido: `Mensaje ${id}`,
  eliminado: false,
  ...extra,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const fire = (event, data) =>
  act(() => {
    [...(listeners.get(event) || [])].forEach((fn) => fn(data));
  });
beforeEach(() => {
  listeners = new Map();
  socket = {
    connected: true,
    on: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    off: (name, fn) => listeners.get(name)?.delete(fn),
    timeout: () => ({
      emit: (event, payload, cb) =>
        cb(null, { ok: true, data: { mensaje: m(2) } }),
    }),
  };
  useSocket.mockReturnValue(socket);
  getMessages.mockResolvedValue({ items: [m(2), m(1)], nextCursor: null });
});
it("ordena el historial y deduplica ack y evento del autor", async () => {
  const { result } = renderHook(() => useMessages(3));
  await waitFor(() => expect(result.current.loading).toBe(false));
  fire("message:new", { mensaje: m(2) });
  await act(async () => {
    await result.current.action("message:send", {
      idConversacion: 3,
      contenido: "Hola",
    });
  });
  expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
});
it("ignora eventos de otra conversación", async () => {
  const { result } = renderHook(() => useMessages(3));
  await waitFor(() => expect(result.current.loading).toBe(false));
  fire("message:new", { mensaje: m(4, { idConversacion: 9 }) });
  expect(result.current.messages).toHaveLength(2);
});
it("una eliminación durante HTTP pendiente no vuelve a mostrar el contenido", async () => {
  const pending = deferred();
  getMessages.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useMessages(3));
  fire("message:deleted", { idConversacion: 3, idMensaje: 1 });
  await act(async () => pending.resolve({ items: [m(1)], nextCursor: null }));
  expect(result.current.messages[0]).toMatchObject({
    eliminado: true,
    contenido: null,
  });
});
it("cambiar rápido de conversación descarta la respuesta anterior", async () => {
  const pending = deferred();
  getMessages
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({
      items: [m(4, { idConversacion: 9 })],
      nextCursor: null,
    });
  const { result, rerender } = renderHook(({ id }) => useMessages(id), {
    initialProps: { id: 3 },
  });
  rerender({ id: 9 });
  await waitFor(() => expect(result.current.messages[0]?.id).toBe(4));
  await act(async () => pending.resolve({ items: [m(1)], nextCursor: null }));
  expect(result.current.messages.map((m) => m.idConversacion)).toEqual([9]);
});
it("carga anteriores sin repetir mensajes y alcanza el final", async () => {
  getMessages
    .mockResolvedValueOnce({ items: [m(2)], nextCursor: 2 })
    .mockResolvedValueOnce({ items: [m(1), m(2)], nextCursor: null });
  const { result } = renderHook(() => useMessages(3));
  await waitFor(() => expect(result.current.cursor).toBe(2));
  await act(async () => result.current.older());
  expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  expect(result.current.cursor).toBeNull();
});
it("una reconexión recupera cambios persistidos perdidos", async () => {
  const { result } = renderHook(() => useMessages(3));
  await waitFor(() => expect(result.current.loading).toBe(false));
  getMessages.mockResolvedValueOnce({
    items: [
      m(2, { eliminado: true, contenido: null }),
      m(1, { contenido: "Editado", fechaEdicion: "2026-10-06T01:00:00Z" }),
    ],
    nextCursor: null,
  });
  fire("connect");
  await waitFor(() => expect(result.current.messages[1].eliminado).toBe(true));
  expect(result.current.messages[0].contenido).toBe("Editado");
});
it("limpia exactamente sus listeners al desmontarse", async () => {
  const { unmount } = renderHook(() => useMessages(3));
  expect(listeners.get("message:new").size).toBe(1);
  unmount();
  expect([...listeners.values()].every((s) => !s.size)).toBe(true);
});
