import { beforeEach, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ConversationsPage from "../pages/ConversationsPage.jsx";
import { useMessages } from "../hooks/useMessages.js";
import { useConversations } from "../context/ConversationsContext.jsx";
vi.mock("../hooks/useMessages.js", () => ({ useMessages: vi.fn() }));
vi.mock("../context/ConversationsContext.jsx", () => ({
  useConversations: vi.fn(),
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombreVisible: "Valen", nombreUsuario: "valen" },
    refresh: vi.fn(),
  }),
}));
vi.mock("../services/conversationsService.js", () => ({
  getConversation: vi.fn().mockResolvedValue({ conversacion: { id: 3 } }),
}));
let action;
let state;
const own = {
  id: 1,
  idAutor: 1,
  idConversacion: 3,
  contenido: "Mensaje propio",
  fechaCreacion: "2026-10-06T00:00:00Z",
  eliminado: false,
};
function renderChat() {
  return render(
    <MemoryRouter initialEntries={["/conversaciones/3"]}>
      <Routes>
        <Route path="/conversaciones/:id" element={<ConversationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  action = vi.fn().mockResolvedValue({ mensaje: own });
  useMessages.mockReturnValue({
    messages: [own, { ...own, id: 2, idAutor: 2, contenido: "Mensaje ajeno" }],
    loading: false,
    error: "",
    cursor: null,
    action,
    reload: vi.fn(),
  });
  state = {
    items: [
      {
        id: 3,
        fechaCreacion: own.fechaCreacion,
        puedeEscribir: true,
        otroUsuario: {
          id: 2,
          nombreVisible: "Fabri",
          nombreUsuario: "fabri",
          disponibilidad: "EN_LINEA",
        },
      },
    ],
    connected: true,
    loading: false,
    error: "",
    remember: vi.fn(),
    reload: vi.fn(),
    getRevision: () => 0,
  };
  useConversations.mockReturnValue(state);
});
it("identifica ambos autores y ofrece controles únicamente para el mensaje propio", () => {
  renderChat();
  expect(screen.getByText("Mensaje propio")).toBeInTheDocument();
  expect(screen.getByText("Mensaje ajeno")).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: /^Editar mensaje de/ }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("button", { name: /^Eliminar mensaje de/ }),
  ).toHaveLength(1);
});
it("conserva el borrador si el envío falla", async () => {
  action.mockRejectedValueOnce(new Error("No pudimos confirmar"));
  renderChat();
  const input = screen.getByRole("textbox", { name: "Mensaje para Fabri" });
  fireEvent.change(input, { target: { value: "Mi texto pendiente" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("Mi texto pendiente");
});
it("limpia el texto confirmado pero no texto nuevo escrito mientras espera el ack", async () => {
  let resolve;
  action.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  renderChat();
  const input = screen.getByRole("textbox", { name: "Mensaje para Fabri" });
  fireEvent.change(input, { target: { value: "Primero" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  fireEvent.change(input, { target: { value: "Segundo" } });
  resolve({ mensaje: own });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Enviar mensaje" }),
    ).not.toBeDisabled(),
  );
  expect(input).toHaveValue("Segundo");
});
it("Enter envía y Shift+Enter permite seguir componiendo", async () => {
  renderChat();
  const input = screen.getByRole("textbox", { name: "Mensaje para Fabri" });
  fireEvent.change(input, { target: { value: "Hola" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(action).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith("message:send", {
      idConversacion: 3,
      contenido: "Hola",
    }),
  );
});
it("sin conexión conserva texto y deshabilita envío; sin amistad deshabilita composición", () => {
  state.connected = false;
  const view = renderChat();
  expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();
  expect(
    screen.getByRole("textbox", { name: "Mensaje para Fabri" }),
  ).not.toBeDisabled();
  state.items[0].puedeEscribir = false;
  view.rerender(
    <MemoryRouter initialEntries={["/conversaciones/3"]}>
      <Routes>
        <Route path="/conversaciones/:id" element={<ConversationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("textbox", { name: "Mensaje para Fabri" }),
  ).toBeDisabled();
});
it("eliminar requiere confirmación y permite cancelar sin operar", async () => {
  renderChat();
  fireEvent.click(screen.getByRole("button", { name: /^Eliminar mensaje de/ }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Eliminar mensaje de/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar mensaje", exact: true }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith("message:delete", { idMensaje: 1 }),
  );
});
it("un mensaje eliminado oculta contenido y controles propios", () => {
  useMessages.mockReturnValue({
    messages: [{ ...own, eliminado: true, contenido: null }],
    loading: false,
    error: "",
    cursor: null,
    action,
  });
  renderChat();
  expect(screen.getByText("Mensaje eliminado")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^Editar mensaje de/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Mensaje propio")).not.toBeInTheDocument();
});
