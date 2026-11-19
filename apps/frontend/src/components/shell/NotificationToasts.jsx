import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import { formatListTime } from '../../utils/chat.js';
import './notificationToasts.css';

const DURACION = 7000;
const VISIBLES = 3;
// Iniciales de la comunidad sin contar «de», «la», «y»…: Taller de Redes → TR.
const siglas = (nombre) => (nombre.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('') || nombre.slice(0, 2)).toUpperCase();
const ORIGEN = { conversacion: 'mensajes', canal: 'canalTexto', amistad: 'perfil' };

export function haceCuanto(fecha, ahora = Date.now()) {
  const min = Math.floor((ahora - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  return formatListTime(fecha);
}

// Lo que dice cada aviso flotante, según el diseño de notificaciones.
export function contenidoDelAviso(g) {
  const c = g.contexto ?? {};
  const vista = g.vista;
  if (g.tipo === 'amistad') {
    return { titulo: `${c.nombre ?? 'Alguien'} te mandó una solicitud`, texto: '', nombre: c.nombre, foto: c.fotoUrl, principal: 'Aceptar', secundaria: 'Rechazar' };
  }
  if (g.tipo === 'canal') {
    const varios = g.nuevas > 1;
    return {
      titulo: varios ? (c.comunidad ?? `#${c.nombre}`) : `${vista?.autor ?? 'Alguien'} en #${c.nombre ?? 'canal'}`,
      texto: vista?.texto ? (varios ? `${vista.autor}: ${vista.texto}` : vista.texto) : '',
      nombre: c.comunidad ?? c.nombre, canal: true,
      principal: varios ? `Ver los ${g.nuevas}` : 'Ver mensaje', secundaria: 'Marcar como leído',
    };
  }
  return {
    titulo: c.nombre ?? 'Mensaje privado',
    texto: vista?.texto ?? (g.nuevas > 1 ? `${g.nuevas} mensajes nuevos` : ''),
    nombre: c.nombre, foto: c.fotoUrl, principal: 'Responder', secundaria: 'Marcar como leído',
  };
}

function Toast({ aviso, onPrincipal, onSecundaria, onCerrar }) {
  const [pausa, setPausa] = useState(false);
  const restante = useRef(DURACION);
  const inicio = useRef(0);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const { titulo, texto, nombre, foto, canal, principal, secundaria } = contenidoDelAviso(aviso);

  useEffect(() => {
    if (pausa) return undefined;
    inicio.current = Date.now();
    const id = setTimeout(() => cerrar.current(), Math.max(0, restante.current));
    return () => {
      clearTimeout(id);
      restante.current -= Date.now() - inicio.current;
    };
  }, [pausa]);

  const pausar = () => setPausa(true);
  const seguir = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPausa(false); };

  return (
    <li className={`ntf ${pausa ? 'is-paused' : ''}`} onMouseEnter={pausar} onMouseLeave={seguir} onFocus={pausar} onBlur={seguir}>
      <span className="ntf-av">
        {canal
          ? <span className="ntf-com" aria-hidden="true">{siglas(nombre ?? '#')}</span>
          : <Avatar nombre={nombre ?? '?'} foto={foto} size={44} />}
        <span className="ntf-origin" aria-hidden="true"><Icon name={ORIGEN[aviso.tipo]} size={12} stroke={2.4} /></span>
      </span>
      <div className="ntf-body">
        <p className="ntf-head">
          <b className="ntf-title">{titulo}</b>
          <time className="ntf-time" dateTime={aviso.fecha}>{haceCuanto(aviso.fecha)}</time>
        </p>
        {texto && <p className="ntf-text">{texto}</p>}
        <div className="ntf-actions">
          <button type="button" className="pr ntf-btn ntf-main" onClick={onPrincipal}>{principal}</button>
          <button type="button" className="pr ntf-btn" onClick={onSecundaria}>{secundaria}</button>
        </div>
      </div>
      <button type="button" className="ntf-close" onClick={onCerrar} aria-label={`Cerrar aviso: ${titulo}`}>
        <Icon name="cerrar" size={14} stroke={2.4} />
      </button>
      <span className="ntf-bar" aria-hidden="true" style={{ animationDuration: `${DURACION}ms` }} />
    </li>
  );
}

export default function NotificationToasts({ avisos, onPrincipal, onSecundaria, onCerrar, onVerTodas }) {
  const visibles = avisos.slice(0, VISIBLES);
  const resto = avisos.length - visibles.length;
  return createPortal(
    <section className="ntf-zone" aria-label="Avisos nuevos">
      <ol className="ntf-list" aria-live="polite" aria-relevant="additions">
        {visibles.map((a) => (
          <Toast key={`${a.key}-${a.nuevas}`} aviso={a}
            onPrincipal={() => onPrincipal(a)} onSecundaria={() => onSecundaria(a)} onCerrar={() => onCerrar(a.key)} />
        ))}
      </ol>
      {resto > 0 && (
        <button type="button" className="pr ntf-more" onClick={onVerTodas}>
          {resto === 1 ? 'Un aviso más' : `${resto} avisos más`} · Ver todas
        </button>
      )}
    </section>,
    document.body,
  );
}
