import {NavLink} from 'react-router';
import Avatar from '../ui/Avatar.jsx';
import CommunityTile from '../ui/CommunityTile.jsx';
import Icon from '../ui/Icon.jsx';
export default function ConversationRow({to,nombre,foto,preview,time,community=false,badge=0,callActive=false,muted=false,onClick}){
 return <NavLink to={to} className={({isActive})=>`row chat-list-row ${isActive?'is-current':''} ${badge?'has-unread':''}`} onClick={onClick}><span className="side-avatar-slot">{community?<CommunityTile nombre={nombre} imagen={foto}/>:<Avatar nombre={nombre} foto={foto} size={46}/>} {callActive&&<span className="side-avatar-call" aria-label="Llamada en curso"><Icon name="telefono" size={10}/></span>}</span><span className="row-text"><span className="nm">{nombre}</span><span className="pv">{preview||'Sin mensajes todavía'}</span></span><span className="side-row-meta">{time&&<time className="tm">{time}</time>}<span className="side-row-indicators">{muted&&<span className="side-muted" aria-label="Notificaciones silenciadas" title="Notificaciones silenciadas"><Icon name="notificacionesSilenciadas" size={15}/></span>}{badge>0&&<span className="side-badge" aria-label={`${badge} mensajes nuevos`}>{badge>99?'99+':badge}</span>}</span></span></NavLink>;
}
