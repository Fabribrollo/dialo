import { describe, it, expect, vi } from "vitest";
import {
  mergeMessages,
  emitWithAck,
  sortConversations,
} from "../utils-chat.js";
const m = (id, extra = {}) => ({
  id,
  fechaCreacion: "2026-10-06T00:00:00Z",
  contenido: "Hola",
  eliminado: false,
  ...extra,
});
describe("historial y ack", () => {
  it("unifica HTTP, ack y eventos y ordena por fecha e ID", () => {
    expect(
      mergeMessages(
        [m(2)],
        [m(1), m(2), m(3, { fechaCreacion: "2026-10-05T00:00:00Z" })],
      ).map((m) => m.id),
    ).toEqual([3, 1, 2]);
  });
  it("una respuesta tardía no restaura un mensaje eliminado", () => {
    expect(
      mergeMessages([m(1, { eliminado: true, contenido: null })], [m(1)])[0]
        .contenido,
    ).toBeNull();
  });
  it("no reemplaza una edición nueva por otra vieja", () => {
    expect(
      mergeMessages(
        [m(1, { contenido: "Nuevo", fechaEdicion: "2026-10-06T02:00:00Z" })],
        [m(1)],
      )[0].contenido,
    ).toBe("Nuevo");
  });
  it("ordena conversaciones por actividad incluyendo conversaciones vacías", () => {
    expect(
      sortConversations([
        {
          id: 1,
          fechaCreacion: "2026-10-01",
          ultimoMensaje: { fechaCreacion: "2026-10-08" },
        },
        { id: 2, fechaCreacion: "2026-10-07" },
      ]).map((c) => c.id),
    ).toEqual([1, 2]);
  });
  it("rechaza envío desconectado sin emitir ni encolar", async () => {
    const socket = { connected: false, timeout: vi.fn() };
    await expect(emitWithAck(socket, "message:send", {})).rejects.toMatchObject(
      { code: "OFFLINE" },
    );
    expect(socket.timeout).not.toHaveBeenCalled();
  });
  it("resuelve éxito y conserva códigos y detalles de error", async () => {
    const emit = vi.fn((event, payload, cb) =>
      cb(null, { ok: true, data: { mensaje: m(1) } }),
    );
    const socket = { connected: true, timeout: () => ({ emit }) };
    expect(await emitWithAck(socket, "message:send", {})).toEqual({
      mensaje: m(1),
    });
    emit.mockImplementation((event, payload, cb) =>
      cb(null, {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Inválido",
          details: [{ campo: "contenido" }],
        },
      }),
    );
    await expect(emitWithAck(socket, "message:send", {})).rejects.toMatchObject(
      { code: "VALIDATION_ERROR", details: [{ campo: "contenido" }] },
    );
  });
  it("un timeout informa que debe revisarse el historial", async () => {
    const socket = {
      connected: true,
      timeout: () => ({ emit: (e, p, cb) => cb(new Error("timeout")) }),
    };
    await expect(emitWithAck(socket, "message:send", {})).rejects.toMatchObject(
      { code: "ACK_TIMEOUT" },
    );
  });
});
