import { useEffect } from 'react';
import { Link } from 'react-router';
import { useSocket } from '../../hooks/useSocket.js';
import { EVENTS } from '../../constants/events.js';
import { useChannels } from '../../hooks/useChannels.js';
import { useCommunityCollection } from '../../hooks/useCommunityCollection.js';
import { getCommunityMembers } from '../../services/communitiesService.js';
import Card from '../ui/Card.jsx';
import Avatar from '../ui/Avatar.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import './communityDashboard.css';

export default function CommunityDashboard({ comunidad }) {
  const channels = useChannels(comunidad.id, true);
  const members = useCommunityCollection(comunidad.id, getCommunityMembers);
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => members.reload();
    socket.on(EVENTS.USER_UPDATED, refresh);
    return () => socket.off(EVENTS.USER_UPDATED, refresh);
  }, [socket, members.reload]);
  const base = `/comunidades/${comunidad.id}`;
  const enLinea = members.items.filter(({ usuario }) => usuario.disponibilidad === 'EN_LINEA').length;
  const resto = members.items.length - 4;

  return (
    <>
      <Card className="cd-card cd-ch">
        <div className="cd-head"><h2>Canales</h2><Link className="lnk lnk-primario cd-link" to={`${base}/canales`}>Ver canales</Link></div>
        {channels.loading && <span className="cd-state" role="status"><Spinner size={15} />Cargando canales…</span>}
        {channels.error && <Notice tone="error" title="No se pudieron cargar los canales." actionLabel="Reintentar canales" onAction={channels.reload} />}
        {!channels.loading && !channels.error && !channels.items.length && <span className="cd-state">No hay canales disponibles para tu cuenta.</span>}
        {channels.items.slice(0, 8).map((canal) => (
          <Link key={canal.id} to={`${base}/canales/${canal.id}`} className="li cd-channel">
            <span className="cd-ch-ic">{canal.tipo === 'TEXTO' ? <Icon name="canalTexto" size={16} stroke={2.1} /> : <Icon name="canalVoz" size={17} stroke={2} />}</span>
            <span className="cd-ch-name">{canal.nombre}</span>
            <span className="cd-ch-priv">{canal.privado ? <><Icon name="privado" size={13} stroke={2} />Privada</> : <><Icon name="publica" size={13} stroke={2} />Pública</>}</span>
          </Link>
        ))}
      </Card>
        <Card className="cd-card cd-members cd-mem">
          <div className="cd-head"><h2>Integrantes</h2><Link className="lnk lnk-primario cd-link" to={`${base}/integrantes`} aria-label="Ver integrantes">Ver integrantes</Link></div>
          {members.loading && <span className="cd-state" role="status"><Spinner size={15} />Cargando integrantes…</span>}
          {members.error && <Notice tone="error" title="No se pudieron cargar los integrantes." actionLabel="Reintentar integrantes" onAction={members.reload} />}
          {!members.loading && !members.error && members.items.length > 0 && (
            <div className="cd-mem-row">
              <span className="cd-stack">
                {members.items.slice(0, 4).map(({ usuario }) => <Avatar key={usuario.id} nombre={usuario.nombreVisible} foto={usuario.fotoUrl} size={38} />)}
                {resto > 0 && <span className="av av-dk" style={{ '--av': '38px' }}>+{resto}</span>}
              </span>
              <span className="cd-mem-count"><span className="dsp">{members.items.length}</span><span>integrantes, {enLinea} en línea</span></span>
            </div>
          )}
          {!members.loading && !members.error && !members.items.length && <span className="cd-state">No hay integrantes para mostrar.</span>}
        </Card>
    </>
  );
}
