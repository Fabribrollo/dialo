import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { acceptInvitation, previewInvitation } from '../../services/invitationsService.js';
import { useCommunities } from '../../context/CommunitiesContext.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import { initials } from '../ui/Avatar.jsx';
import './inviteEmbed.css';

export const INVITE_LINK = /(?:https?:\/\/)?[^\s]*\/invitacion\/([A-Za-z0-9_-]+)/g;

export function linkify(texto) {
  const partes = [];
  let ultimo = 0;
  for (const m of texto.matchAll(INVITE_LINK)) {
    partes.push(texto.slice(ultimo, m.index));
    partes.push(<Link key={m.index} className="iv-lk" to={`/invitacion/${m[1]}`}>{m[0].replace(/^https?:\/\//, '')}</Link>);
    ultimo = m.index + m[0].length;
  }
  partes.push(texto.slice(ultimo));
  return partes;
}

export default function InviteEmbed({ codigo }) {
  const navigate = useNavigate();
  const communities = useCommunities();
  const [comunidad, setComunidad] = useState(null);
  const [inactiva, setInactiva] = useState(false);
  const [estado, setEstado] = useState('');

  useEffect(() => {
    let activo = true;
    previewInvitation(codigo)
      .then(({ comunidad: c }) => { if (activo) setComunidad(c); })
      .catch(() => { if (activo) setInactiva(true); });
    return () => { activo = false; };
  }, [codigo]);

  async function unirme() {
    if (estado) return;
    setEstado('busy');
    try {
      const { comunidad: c } = await acceptInvitation(codigo);
      communities?.remember(c);
      setComunidad((old) => ({ ...old, ...c, esIntegrante: true }));
      setEstado('');
    } catch {
      setEstado('');
      setInactiva(true);
    }
  }

  if (inactiva) {
    return (
      <div className="iv-emb iv-emb-off">
        <div className="iv-emb-row">
          <span className="iv-emb-tile iv-blk"><Icon name="enlace" size={24} stroke={1.9} /></span>
          <span className="iv-emb-text"><span className="dsp iv-emb-name">Invitación vencida</span><span className="iv-emb-sub">Pedí un enlace nuevo</span></span>
        </div>
      </div>
    );
  }
  if (!comunidad) return null;

  return (
    <div className="iv-emb">
      <div className="iv-emb-row">
        <span className="iv-emb-tile">{comunidad.imagenUrl ? <img src={comunidad.imagenUrl} alt="" /> : initials(comunidad.nombre)}</span>
        <span className="iv-emb-text">
          <span className="dsp iv-emb-name">{comunidad.nombre}</span>
          <span className="iv-emb-sub"><Icon name={comunidad.tipo === 'PUBLICA' ? 'publica' : 'privado'} size={13} stroke={2} />
            {comunidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'} · {comunidad.cantidadIntegrantes} {comunidad.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}</span>
        </span>
      </div>
      {comunidad.esIntegrante ? (
        <div className="iv-emb-row">
          <span className="iv-emb-in"><Icon name="check" size={16} stroke={2.6} />Ya sos integrante</span>
          <Button size="sm" variant="secundario" onClick={() => navigate(`/comunidades/${comunidad.id}`)}>Abrir comunidad</Button>
        </div>
      ) : (
        <Button className="iv-emb-btn" loading={estado === 'busy'} disabled={estado === 'busy'} onClick={unirme}>{estado === 'busy' ? 'Entrando…' : 'Unirme'}</Button>
      )}
    </div>
  );
}
