import { useEffect, useRef, useState } from "react";
import { searchUsers } from "../../services/friendsService.js";
import { BotonAccion } from "./BotonAccion.jsx";
import { UsuarioInfo } from "./UsuarioInfo.jsx";

// boton o texto segun la relacion con cada resultado.
function AccionRelacion({ usuario, friends }) {
  const relacion = friends.relacionCon(usuario.id);
  if (relacion === "AMIGOS") return <span>Amigos</span>;
  if (relacion === "SOLICITUD_ENVIADA") return <span>Pendiente</span>;
  if (relacion === "SOLICITUD_RECIBIDA") {
    const solicitud = friends.recibidas.find((s) => s.emisor.id === usuario.id);
    return (
      <BotonAccion accion={() => friends.aceptar(solicitud.id)}>
        Aceptar solicitud
      </BotonAccion>
    );
  }
  return (
    <BotonAccion accion={() => friends.enviar(usuario.id)}>Agregar</BotonAccion>
  );
}

export function BuscadorUsuarios({ friends }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [estado, setEstado] = useState("inicial"); // 'inicial' | 'cargando' | 'listo' | 'error'
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const ultimaBusqueda = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      setEstado("inicial");
      return undefined;
    }

    // Cada búsqueda tiene un nro. Si llega la respuesta de una busqueda vieja, se ignora.
    const numero = ++ultimaBusqueda.current;
    setEstado("cargando");

    // Espera 300 ms sin escribir antes de buscar, para no mandar un pedido por cada tecla.
    const timer = setTimeout(async () => {
      try {
        const { items } = await searchUsers(texto);
        if (numero !== ultimaBusqueda.current) return;
        setResultados(items.map((item) => item.usuario));
        setEstado("listo");
      } catch (e) {
        if (numero !== ultimaBusqueda.current) return;
        setError(e.message);
        setEstado("error");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [q, intento]);

  return (
    <div>
      <label htmlFor="buscar-usuarios">Buscar por nombre</label>
      <input
        id="buscar-usuarios"
        type="search"
        value={q}
        maxLength={32}
        placeholder="Al menos 2 letras"
        onChange={(e) => setQ(e.target.value)}
      />

      {estado === "cargando" && <p>Buscando…</p>}
      {estado === "error" && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </p>
      )}
      {estado === "listo" && resultados.length === 0 && (
        <p>No se encontraron personas.</p>
      )}
      {estado === "listo" && resultados.length > 0 && (
        <ul>
          {resultados.map((usuario) => (
            <li key={usuario.id}>
              <UsuarioInfo usuario={usuario} />{" "}
              <AccionRelacion usuario={usuario} friends={friends} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
