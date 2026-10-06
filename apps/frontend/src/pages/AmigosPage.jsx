import { AmigosLista } from "../components/friends/AmigosLista.jsx";
import { BuscadorUsuarios } from "../components/friends/BuscadorUsuarios.jsx";
import {
  SolicitudesEnviadas,
  SolicitudesRecibidas,
} from "../components/friends/SolicitudesListas.jsx";
import { useFriends } from "../hooks/useFriends.js";

export default function AmigosPage() {
  const friends = useFriends();

  if (friends.estado === "cargando")
    return (
      <div className="empty-state app-loading" role="status">
        Cargando amigos…
      </div>
    );
  if (friends.estado === "error") {
    return (
      <div className="empty-state" role="alert">
        <p>{friends.error}</p>
        <button type="button" onClick={friends.recargar}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="page-container friends-page">
      <header className="page-heading">
        <h1>Amigos</h1>
        <p>
          Buscá usuarios y administrá tus solicitudes de amistad.
        </p>
      </header>

      <section className="panel" aria-labelledby="titulo-buscar">
        <h2 id="titulo-buscar">Buscar personas</h2>
        <BuscadorUsuarios friends={friends} />
      </section>

      <section className="panel" aria-labelledby="titulo-recibidas">
        <h2 id="titulo-recibidas">
          Solicitudes recibidas ({friends.recibidas.length})
        </h2>
        <SolicitudesRecibidas friends={friends} />
      </section>

      <section className="panel" aria-labelledby="titulo-enviadas">
        <h2 id="titulo-enviadas">
          Solicitudes enviadas ({friends.enviadas.length})
        </h2>
        <SolicitudesEnviadas friends={friends} />
      </section>

      <section className="panel" aria-labelledby="titulo-amigos">
        <h2 id="titulo-amigos">Mis amigos ({friends.amigos.length})</h2>
        <AmigosLista friends={friends} />
      </section>
    </div>
  );
}
