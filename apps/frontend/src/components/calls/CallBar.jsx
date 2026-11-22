import {Link} from 'react-router';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import {useCallTime} from '../../hooks/useCallTime.js';
import './callBar.css';
export default function CallBar({title,status,desde,people=[],to,backLabel='Volver a la llamada',onEnd,busy,controls,onReturn}){
 const time=useCallTime(desde);
 return <aside className="active-call-bar" aria-label="Llamada activa"><div className="lg dk call-top-inner">
  <span className="call-top-icon" aria-hidden="true"><Icon name="telefono" size={18}/></span><span className="call-top-text"><b title={title}>{title}</b><span>{status}{time&&` · ${time}`}</span></span>
  <span className="call-top-people" aria-label={`${people.length} participantes`}>{people.slice(0,3).map((p,i)=><Avatar key={p.idUsuario??p.id??i} nombre={p.nombre??p.nombreVisible} foto={p.foto??p.fotoUrl} size={27}/>)}</span>
  <span className="call-top-controls">{controls}</span><Link className="pr call-top-back" to={to} onClick={onReturn} aria-label={backLabel}><Icon name="chevron" size={16}/><span>Volver</span></Link>
  <button type="button" className="ib pr call-top-end" aria-label="Finalizar llamada" onClick={onEnd} disabled={busy}><Icon name="colgar" size={19}/></button>
 </div></aside>;
}
