import { BotonAccion } from "./BotonAccion.jsx";
import { UsuarioInfo } from "./UsuarioInfo.jsx";

export function SolicitudesRecibidas({ friends }) {
  if (friends.recibidas.length === 0)
    return <p>No tenes solicitudes recibidas.</p>;
  return (
    <ul>
      {friends.recibidas.map((s) => (
        <li key={s.id}>
          <UsuarioInfo usuario={s.emisor} />{" "}
          <BotonAccion accion={() => friends.aceptar(s.id)}>
            Aceptar
          </BotonAccion>{" "}
          <BotonAccion accion={() => friends.rechazar(s.id)}>
            Rechazar
          </BotonAccion>
        </li>
      ))}
    </ul>
  );
}

export function SolicitudesEnviadas({ friends }) {
  if (friends.enviadas.length === 0)
    return <p>No tenes solicitudes enviadas.</p>;
  return (
    <ul>
      {friends.enviadas.map((s) => (
        <li key={s.id}>
          <UsuarioInfo usuario={s.receptor} /> <span>Pendiente</span>
        </li>
      ))}
    </ul>
  );
}
