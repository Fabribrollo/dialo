import { useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket.js';
import { EVENTS } from '../../constants/events.js';
import { Link } from 'react-router';
import { useChannels } from '../../hooks/useChannels.js';
import { useCommunityCollection } from '../../hooks/useCommunityCollection.js';
import { getCommunityMembers } from '../../services/communitiesService.js';
import { CHANNEL_TYPES } from '../channels/ChannelForm.jsx';
import Avatar from '../Avatar.jsx';

const roles = { PROPIETARIO: 'Propietario', ADMIN: 'Administrador', MODERADOR: 'Moderador', INTEGRANTE: 'Integrante' };

export default function CommunityDashboard({ comunidad }) {
  const channels = useChannels(comunidad.id, true);
  const members = useCommunityCollection(comunidad.id, getCommunityMembers);
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const refresh = () => members.reload();
    socket.on(EVENTS.USER_UPDATED, refresh);
    return () => socket.off(EVENTS.USER_UPDATED, refresh);
  }, [socket, members.reload]);
  const base = `/comunidades/${comunidad.id}`;
  return <div className="community-dashboard">
    <section className="community-hub-channels" aria-labelledby="hub-channels-title">
      <header className="hub-heading"><div><p className="eyebrow">Conversaciones de la comunidad</p><h2 id="hub-channels-title">Canales disponibles</h2></div><Link className="button-link" to={`${base}/canales`}>Ver canales</Link></header>
      {channels.loading && <p role="status">Cargando canales…</p>}
      {channels.error && <p role="alert" className="notice error">No se pudieron cargar los canales. <button type="button" className="secondary" onClick={channels.reload}>Reintentar canales</button></p>}
      {!channels.loading && !channels.error && !channels.items.length && <p className="community-help">No hay canales disponibles para tu cuenta.</p>}
      <ul className="hub-channel-grid">{channels.items.slice(0, 8).map((canal) => <li key={canal.id}>
        <Link to={`${base}/canales/${canal.id}`} className="hub-channel" data-type={canal.tipo}>
          <span className="hub-channel-symbol" aria-hidden="true">{canal.tipo === 'TEXTO' ? '#' : '◉'}</span>
          <span><strong>{canal.nombre}</strong><small>{CHANNEL_TYPES[canal.tipo]} · {canal.privado ? 'Privado' : 'Público'}</small></span>
          <span className="hub-arrow" aria-hidden="true">↗</span>
        </Link>
      </li>)}</ul>
      {channels.items.length > 8 && <Link className="hub-more" to={`${base}/canales`}>Ver los {channels.items.length} canales →</Link>}
    </section>
    <section className="community-hub-members" aria-labelledby="hub-members-title">
      <header className="hub-heading"><div><p className="eyebrow">La comunidad</p><h2 id="hub-members-title">Integrantes</h2></div><Link aria-label="Ver integrantes" to={`${base}/integrantes`}>Ver integrantes ↗</Link></header>
      {members.loading && <p role="status">Cargando integrantes…</p>}
      {members.error && <p role="alert" className="notice error">No se pudieron cargar los integrantes. <button type="button" className="secondary" onClick={members.reload}>Reintentar integrantes</button></p>}
      <ul className="hub-member-list">{members.items.slice(0, 6).map(({ usuario, rol }) => <li key={usuario.id}>
        <Avatar usuario={usuario} /><div><strong>{usuario.nombreVisible}</strong><span>@{usuario.nombreUsuario}</span></div><small>Rol: {roles[rol]}</small>
      </li>)}</ul>
      {!members.loading && !members.error && !members.items.length && <p className="community-help">No hay integrantes para mostrar.</p>}
      {members.items.length > 6 && <Link className="hub-more" to={`${base}/integrantes`}>Ver los {members.items.length} integrantes →</Link>}
    </section>
  </div>;
}
