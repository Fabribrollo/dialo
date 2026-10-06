import { beforeEach, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  ConversationsProvider,
  useConversations,
} from "../context/ConversationsContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { getConversations } from "../services/conversationsService.js";
vi.mock("../hooks/useSocket.js", () => ({ useSocket: vi.fn() }));
const auth = vi.hoisted(() => ({
  usuario: { id: 1 },
  refresh: vi.fn(),
  setUsuario: vi.fn(),
}));
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => auth }));
vi.mock("../services/conversationsService.js", () => ({
  getConversations: vi.fn(),
}));
const chat = {
  id: 3,
  fechaCreacion: "2026-10-06T00:00:00Z",
  puedeEscribir: true,
  otroUsuario: { id: 2, nombreVisible: "Fabri", nombreUsuario: "fabri" },
  ultimoMensaje: null,
};
let listeners;
function fire(event, data) {
  act(() => {
    [...(listeners.get(event) || [])].forEach((fn) => fn(data));
  });
}
beforeEach(() => {
  listeners = new Map();
  useSocket.mockReturnValue({
    connected: true,
    on: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    off: (name, fn) => listeners.get(name)?.delete(fn),
  });
  getConversations.mockResolvedValue({ items: [structuredClone(chat)] });
});
it("friend:removed deshabilita escritura y user:updated cambia identidad", async () => {
  const { result } = renderHook(useConversations, {
    wrapper: ConversationsProvider,
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  fire("friend:removed", { idUsuario: 2 });
  expect(result.current.items[0].puedeEscribir).toBe(false);
  fire("user:updated", {
    usuario: { ...chat.otroUsuario, nombreVisible: "Nuevo nombre" },
  });
  expect(result.current.items[0].otroUsuario.nombreVisible).toBe(
    "Nuevo nombre",
  );
});
it("un último mensaje eliminado no se restaura con un evento de edición tardío", async () => {
  const { result } = renderHook(useConversations, {
    wrapper: ConversationsProvider,
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  const mensaje = {
    id: 1,
    idConversacion: 3,
    fechaCreacion: chat.fechaCreacion,
    contenido: "Original",
  };
  fire("message:new", { mensaje });
  fire("message:deleted", { idConversacion: 3, idMensaje: 1 });
  fire("message:updated", {
    mensaje: { ...mensaje, contenido: "Edición tardía" },
  });
  expect(result.current.items[0].ultimoMensaje.contenido).toBeNull();
});
it("una consulta tardía de detalle no revierte eventos de amistad", async () => {
  const { result } = renderHook(useConversations, {
    wrapper: ConversationsProvider,
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  const version = result.current.getRevision();
  fire("friend:removed", { idUsuario: 2 });
  act(() => result.current.remember(chat, version));
  expect(result.current.items[0].puedeEscribir).toBe(false);
});
it("reconectar consulta HTTP de nuevo y al desmontar limpia listeners", async () => {
  const { result, unmount } = renderHook(useConversations, {
    wrapper: ConversationsProvider,
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  fire("disconnect", "transport close");
  expect(result.current.connected).toBe(false);
  getConversations.mockResolvedValueOnce({
    items: [{ ...chat, puedeEscribir: false }],
  });
  fire("connect");
  await waitFor(() =>
    expect(result.current.items[0].puedeEscribir).toBe(false),
  );
  expect(result.current.connected).toBe(true);
  unmount();
  expect([...listeners.values()].every((s) => !s.size)).toBe(true);
});
