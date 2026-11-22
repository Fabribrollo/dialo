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
        {!channels.loading&&!channels.error&&channels.items.length>0&&<div className="cd-mem-row"><span className="cd-stack cd-channel-icons" aria-hidden="true">{['TEXTO','VOZ'].filter(tipo=>channels.items.some(c=>tipo==='VOZ'?c.tipo!=='TEXTO':c.tipo==='TEXTO')).map(tipo=><span className="av" key={tipo}><Icon name={tipo==='TEXTO'?'canalTexto':'canalVoz'} size={20}/></span>)}</span><span className="cd-mem-count"><span className="dsp">{channels.items.length}</span><span>canales · {channels.items.filter(c=>c.tipo==='TEXTO').length} de texto y {channels.items.filter(c=>c.tipo!=='TEXTO').length} de voz</span></span></div>}
      </Card>
        <Card className="cd-card cd-members cd-mem">
          <div className="cd-head"><h2>Integrantes</h2><Link className="lnk lnk-primario cd-link" to={`${base}/integrantes`} aria-label="Ver integrantes">Ver integrantes</Link></div>
          {members.loading && <span className="cd-state" role="status"><Spinner size={15} />Cargando integrantes…</span>}
          {members.error && <Notice tone="error" title="No se pudieron cargar los integrantes." actionLabel="Reintentar integrantes" onAction={members.reload} />}
          {!members.loading && !members.error && members.items.length > 0 && (
            <div className="cd-mem-row">
              <span className="cd-stack">
                {members.items.slice(0, 4).map(({ usuario }) => <Avatar key={usuario.id} nombre={usuario.nombreVisible} foto={usuario.fotoUrl} color={usuario.colorAvatar} size={38} />)}
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
