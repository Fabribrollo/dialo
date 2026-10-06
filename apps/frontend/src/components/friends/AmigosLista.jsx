import { useNavigate } from "react-router";
import { openConversation } from "../../services/conversationsService.js";
import { useConversations } from "../../context/ConversationsContext.jsx";
import { BotonAccion } from "./BotonAccion.jsx";
import { UsuarioInfo } from "./UsuarioInfo.jsx";

export function AmigosLista({ friends }) {
  const navigate = useNavigate();
  const { remember } = useConversations();
  if (friends.amigos.length === 0)
    return <p>Todavía no tenés amigos. Buscá personas arriba.</p>;

  return (
    <ul>
      {friends.amigos.map(({ usuario }) => (
        <li key={usuario.id}>
          <UsuarioInfo usuario={usuario} />{" "}
          <BotonAccion
            accion={async () => {
              const { conversacion } = await openConversation(usuario.id);
              remember(conversacion);
              navigate(`/conversaciones/${conversacion.id}`);
            }}
          >
            Conversar
          </BotonAccion>
          <BotonAccion
            className="secondary"
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
