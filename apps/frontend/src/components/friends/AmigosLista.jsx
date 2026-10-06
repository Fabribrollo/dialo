import { BotonAccion } from "./BotonAccion.jsx";
import { UsuarioInfo } from "./UsuarioInfo.jsx";

export function AmigosLista({ friends }) {
  if (friends.amigos.length === 0)
    return <p>Todavía no tenés amigos. Buscá personas arriba.</p>;

  return (
    <ul>
      {friends.amigos.map(({ usuario }) => (
        <li key={usuario.id}>
          <UsuarioInfo usuario={usuario} />{" "}
          <BotonAccion
            aria-label={`Eliminar a ${usuario.nombreVisible} de tus amigos`}
            accion={async () => {
              // Pide confirmación antes de eliminar.
              if (
                window.confirm(
                  `¿Eliminar a ${usuario.nombreVisible} de tus amigos?`,
                )
              ) {
                await friends.eliminar(usuario.id);
              }
            }}
          >
            Eliminar
          </BotonAccion>
        </li>
      ))}
    </ul>
  );
}
