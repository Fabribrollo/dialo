import { useState } from 'react';
import { Link } from 'react-router';
import { useCall } from '../../hooks/useCall.js';
import { useCallParticipants } from '../../hooks/useCallParticipants.js';
import Avatar, { AvatarGroup } from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import RightPanel from '../shell/RightPanel.jsx';
import { unirParticipantes } from './CallPanel.jsx';
import './calls.css';

const VISIBLES = 5;

function estadoDe(p) {
  if (p.pantalla) return ['pantalla', 'Comparte pantalla'];
  if (p.video) return ['camara', 'Con cámara'];
  if (p.microfono === false) return ['silenciado', 'Silenciado'];
  return null;
}

export default function VoiceSidePanel({ canales, base }) {
  const call = useCall();
  if (!call || !canales.length) return null;
  return <VoicePanel call={call} canales={canales} base={base} />;
}

function VoicePanel({ call, canales, base }) {
  const canal = canales.find((c) => c.id === call.canal?.id) ?? canales[0];
  const participantes = useCallParticipants(canal.id);
  const [abierta, setAbierta] = useState(false);
  const enEste = call.canal?.id === canal.id && ['CONECTANDO', 'CONECTADO', 'RECONECTANDO'].includes(call.estado);
  const personas = unirParticipantes(participantes.items, enEste ? call.participantes : []);
  const visibles = abierta ? personas : personas.slice(0, VISIBLES);
  const resto = personas.length - VISIBLES;

  return (
    <RightPanel label={`Llamada de ${canal.nombre}`}>
      <div className="vsp">
        <Link to={`${base}/${canal.id}`} className="vsp-title"><Icon name="canalVoz" size={17} stroke={2} />{canal.nombre}</Link>
        {personas.length === 0 ? <span className="vsp-empty">Todavía no hay nadie conectado</span> : (
          <ul className="vsp-list" aria-label={`En ${canal.nombre}`}>
            {visibles.map((p) => {
              const estado = estadoDe(p);
              return (
                <li key={p.idUsuario} className="vsp-person">
                  <Avatar nombre={p.nombre} foto={p.foto} size={40} dark={p.local} className={p.hablando ? 'vsp-speaking' : ''} />
                  <span className="vsp-text">
                    <span className="vsp-name">{p.local ? 'Vos' : p.nombre}</span>
                    {estado && <span className="vsp-state"><Icon name={estado[0]} size={13} stroke={2} />{estado[1]}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {resto > 0 && (
          <button type="button" className="pr vsp-more" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
            {!abierta && <AvatarGroup people={personas.slice(VISIBLES).map((p) => ({ id: p.idUsuario, nombre: p.nombre, foto: p.foto }))} max={3} size={26} />}
            <span>{abierta ? 'Ver menos' : `${resto} más`}</span>
            <span className={`vsp-chev ${abierta ? 'is-open' : ''}`}><Icon name="chevron" size={15} stroke={2.2} /></span>
          </button>
        )}
        {enEste
          ? <Button variant="oscuro" className="vsp-join" onClick={call.salir}>Salir</Button>
          : <Button variant="oscuro" className="vsp-join" onClick={() => call.entrar(canal)}>Unirme a la llamada</Button>}
      </div>
    </RightPanel>
  );
}
