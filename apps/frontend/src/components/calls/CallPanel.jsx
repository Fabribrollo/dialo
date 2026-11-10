import { useCall } from '../../hooks/useCall.js';
import { useCallParticipants } from '../../hooks/useCallParticipants.js';

const ESTADOS = {
  CONECTANDO: 'Conectando a la llamada…',
  CONECTADO: 'Estás en la llamada.',
  RECONECTANDO: 'Se cortó la conexión. Reconectando…',
  SALIENDO: 'Saliendo de la llamada…',
};

function unirParticipantes(delBack, deLiveKit) {
  const vivos = new Map(deLiveKit.map((p) => [p.idUsuario, p]));
  const lista = delBack.map(({ usuario }) => ({
    idUsuario: usuario.id,
    nombre: usuario.nombreVisible || usuario.nombreUsuario,
    ...vivos.get(usuario.id) && { microfono: vivos.get(usuario.id).microfono, hablando: vivos.get(usuario.id).hablando },
  }));
  for (const p of deLiveKit) if (!lista.some((l) => l.idUsuario === p.idUsuario)) lista.push(p);
  return lista;
}

export function MicrophoneButton({ call }) {
  return <button type="button" className="secondary call-mic-button" disabled={call.estado !== 'CONECTADO'} onClick={call.alternarMicrofono}>
    {call.microfono ? 'Silenciar micrófono' : 'Activar micrófono'}
  </button>;
}

export default function CallPanel({ canal }) {
  const call = useCall();
  const participantes = useCallParticipants(canal.id);
  const enEste = call.canal?.id === canal.id;
  const estado = enEste ? call.estado : 'DESCONECTADO';
  const enLlamada = ['CONECTANDO', 'CONECTADO', 'RECONECTANDO', 'SALIENDO'].includes(estado);
  const puedeHablar = canal.misPermisos.includes('HABLAR') && call.misPermisos.includes('HABLAR');
  const otraLlamada = call.canal && !enEste && call.estado !== 'ERROR' ? call.canal : null;
  const lista = unirParticipantes(participantes.items, enEste && estado === 'CONECTADO' ? call.participantes : []);

  return <section className="call-panel" aria-label="Llamada de voz">
    <div className="call-status">
      {enLlamada && <p role="status">{ESTADOS[estado]}</p>}
      {!enLlamada && estado !== 'ERROR' && <p>{otraLlamada ? `Estás en la llamada de «${otraLlamada.nombre}».` : 'No estás en esta llamada.'}</p>}
      {enEste && call.error && <p role="alert" className="notice error">{call.error.message}</p>}
      {!canal.misPermisos.includes('HABLAR') && <p className="community-help">Podés escuchar y ver, pero no hablar en este canal.</p>}
    </div>

    <div className="community-actions call-controls">
      {!enLlamada && estado !== 'ERROR' && <button type="button" onClick={() => call.entrar(canal)}>
        {otraLlamada ? 'Cambiar a esta llamada' : 'Unirse a la llamada'}</button>}
      {estado === 'ERROR' && call.error?.code === 'ALREADY_IN_CALL'
        ? <button type="button" onClick={() => call.entrar(canal, { reemplazar: true })}>Salir de la otra llamada y unirme</button>
        : estado === 'ERROR' && <button type="button" onClick={() => call.entrar(canal)}>Reintentar</button>}
      {enLlamada && puedeHablar && <MicrophoneButton call={call} />}
      {enEste && call.audioBloqueado && <button type="button" className="secondary" onClick={call.activarAudio}>Activar audio</button>}
      {(enLlamada || estado === 'ERROR') && <button type="button" className="secondary danger" disabled={estado === 'SALIENDO'}
        onClick={call.salir}>{estado === 'ERROR' ? 'Cerrar' : 'Salir de la llamada'}</button>}
    </div>

    <h2 className="call-heading">En la llamada ({lista.length})</h2>
    {participantes.error && <p role="alert" className="notice error">{participantes.error}</p>}
    {lista.length === 0 ? <p className="community-help">Todavía no hay nadie conectado.</p>
      : <ul className="call-participants">{lista.map((p) => <li key={p.idUsuario} className={p.hablando ? 'is-speaking' : ''}>
        <span className="call-participant-name">{p.nombre}</span>
        {p.hablando && <span className="call-badge speaking">Hablando</span>}
        {p.microfono === false && <span className="call-badge">Silenciado</span>}
      </li>)}</ul>}
  </section>;
}
