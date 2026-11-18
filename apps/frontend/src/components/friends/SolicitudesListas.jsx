import Card, { ListRow } from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import { BotonAccion } from './BotonAccion.jsx';
import { UsuarioInfo } from './UsuarioInfo.jsx';

export function SolicitudesRecibidas({ friends }) {
  if (friends.recibidas.length === 0) return <p className="fr-none">No tenés solicitudes recibidas.</p>;
  return (
    <Card as="ul">
      {friends.recibidas.map((s) => (
        <ListRow as="li" key={s.id}>
          <UsuarioInfo usuario={s.emisor} />
          <BotonAccion variant="primario" accion={() => friends.aceptar(s.id)}>Aceptar</BotonAccion>
          <BotonAccion accion={() => friends.rechazar(s.id)}>Rechazar</BotonAccion>
        </ListRow>
      ))}
    </Card>
  );
}

export function SolicitudesEnviadas({ friends }) {
  if (friends.enviadas.length === 0) return <p className="fr-none">No tenés solicitudes enviadas.</p>;
  return (
    <Card as="ul">
      {friends.enviadas.map((s) => (
        <ListRow as="li" key={s.id}>
          <UsuarioInfo usuario={s.receptor} />
          <Badge kind="pendiente" />
        </ListRow>
      ))}
    </Card>
  );
}
