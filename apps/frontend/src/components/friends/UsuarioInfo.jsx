import Avatar, { statusNames } from "../Avatar.jsx";
export function UsuarioInfo({ usuario }) {
  return (
    <span className="person-info">
      <Avatar usuario={usuario} />
      <span>
        <strong>{usuario.nombreVisible}</strong>
        <small>
          @{usuario.nombreUsuario} · {statusNames[usuario.disponibilidad]}
        </small>
      </span>
    </span>
  );
}
