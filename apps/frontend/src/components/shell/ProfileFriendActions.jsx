import { useNavigate } from 'react-router';
import { useFriends } from '../../hooks/useFriends.js';
import { useConversations } from '../../context/ConversationsContext.jsx';
import { openConversation } from '../../services/conversationsService.js';
import { BotonAccion } from '../friends/BotonAccion.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import { avisar } from './systemToastsStore.js';

// Acción principal del perfil de otra persona según la amistad: chatear, enviar, aceptar o esperar la solicitud.
export default function ProfileFriendActions({ user, onDone }) {
  const friends = useFriends();
  const { remember } = useConversations();
  const navigate = useNavigate();
  if (friends.estado === 'cargando') return <Button variant="primario" disabled loading>Cargando…</Button>;
  const relacion = friends.relacionCon(user.id);
  const nombre = user.nombreVisible.split(' ')[0];

  if (relacion === 'AMIGOS') return (
    <BotonAccion variant="primario" accion={async () => {
      const { conversacion } = await openConversation(user.id);
      remember(conversacion);
      onDone?.();
      navigate(`/conversaciones/${conversacion.id}`);
    }}><Icon name="mensajes" size={16} stroke={2} />Enviar mensaje</BotonAccion>
  );
  if (relacion === 'SOLICITUD_ENVIADA') return <Button variant="secundario" disabled><Icon name="reloj" size={16} stroke={2} />Solicitud enviada</Button>;
  if (relacion === 'SOLICITUD_RECIBIDA') {
    const solicitud = friends.recibidas.find((s) => s.emisor.id === user.id);
    return <BotonAccion variant="primario" accion={async () => { await friends.aceptar(solicitud.id); avisar({ texto: `Ahora sos amigo de ${nombre}.` }); }}><Icon name="check" size={16} stroke={2.2} />Aceptar solicitud</BotonAccion>;
  }
  return <BotonAccion variant="primario" accion={async () => { await friends.enviar(user.id); avisar({ texto: `Le enviaste una solicitud a ${nombre}.` }); }}><Icon name="amigos" size={16} stroke={2} />Enviar solicitud</BotonAccion>;
}
