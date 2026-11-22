import Icon from '../ui/Icon.jsx';
export default function LatestMessages({reading}){
 return reading.away?<div className="latest-message-row"><button type="button" className="latest-messages lg" aria-label={reading.count?`Ir al último mensaje, ${reading.count} mensajes nuevos`:'Ir al último mensaje'} title="Ir al último mensaje" onClick={reading.toLatest}><Icon name="chevron" size={19}/></button></div>:null;
}
