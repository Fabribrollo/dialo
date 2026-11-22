import { useState } from 'react';
import { Link } from 'react-router';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import './channelList.css';

export default function ChannelList({ items, base, canManage, disabled, onReorder, onEdit }) {
  const [drag, setDrag] = useState(null);
  const [order, setOrder] = useState(null);
  const shown = order ? order.map((id) => items.find((c) => c.id === id)).filter(Boolean) : items;

  function enter(id) {
    if (drag === null || drag === id) return;
    const ids = shown.map((c) => c.id);
    const from = ids.indexOf(drag), to = ids.indexOf(id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setOrder(ids);
  }
  function end() {
    const ids = order;
    setDrag(null);
    setOrder(null);
    if (ids && ids.join() !== items.map((c) => c.id).join()) onReorder(ids);
  }

  return (
    <nav aria-label="Canales de la comunidad"><Card as="ul" className="chl">
      {shown.map((canal) => (
        <li
          key={canal.id}
          className={`li chl-row ${canManage ? 'chl-dnd' : ''} ${drag === canal.id ? 'chl-drag' : ''}`}
          draggable={canManage && !disabled}
          onDragStart={(e) => { e.dataTransfer?.setData('text/plain', String(canal.id)); setDrag(canal.id); }}
          onDragEnter={() => enter(canal.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); end(); }}
          onDragEnd={end}
        >
          {canManage && <span className="chl-grip" aria-hidden="true"><Icon name="grip" size={18} stroke={2} /></span>}
          <Link to={`${base}/${canal.id}`} className="chl-link" aria-label={`${canal.tipo === 'TEXTO' ? 'Texto' : 'Voz'} ${canal.nombre}`}>
            <span className="cd-ch-ic">{canal.tipo === 'TEXTO' ? <Icon name="canalTexto" size={16} stroke={2.1} /> : <Icon name="canalVoz" size={17} stroke={2} />}</span>
            <span className="chl-name">{canal.nombre}{canal.bloqueado && <span className="li-sub"> · Bloqueado{canal.solicitud==='PENDIENTE'?' · Solicitud pendiente':''}</span>}</span>
          </Link>
          <span className="cd-ch-priv">{canal.privado ? <><Icon name="privado" size={13} stroke={2} />Privada</> : <><Icon name="publica" size={13} stroke={2} />Pública</>}</span>
          {canManage && (
            <button type="button" className="chl-edit pr" aria-label={`Editar «${canal.nombre}»`} onClick={(e) => onEdit(canal, e.currentTarget)}>
              <Icon name="lapiz" size={15} stroke={2} />
            </button>
          )}
        </li>
      ))}
    </Card></nav>
  );
}
