import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCommunity } from '../hooks/useCommunity.js';
import { useChannels } from '../hooks/useChannels.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import CommunityActionDialog from '../components/communities/CommunityActionDialog.jsx';
import ChannelForm, { CHANNEL_TYPES } from '../components/channels/ChannelForm.jsx';
import ChannelAccessForm from '../components/channels/ChannelAccessForm.jsx';
import ChannelChat from '../components/channel-chat/ChannelChat.jsx';
import ChannelSelector from '../components/channels/ChannelSelector.jsx';
import CommunityNav from '../components/communities/CommunityNav.jsx';
import { deleteChannel, orderChannels } from '../services/channelsService.js';

function ChannelsWorkspace({ comunidad, refreshCommunity }) {
  const { canalId: param } = useParams();
  const list = useChannels(comunidad.id, true);
  const base = `/comunidades/${comunidad.id}/canales`;
  const creating = param === 'nuevo';
  const selectedId = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const selected = list.items.find((c) => c.id === selectedId);
  const canManage = ['PROPIETARIO', 'ADMIN'].includes(comunidad.miRol);
  const [drafts, setDrafts] = useState({});
  const [mode, setMode] = useState(null), [seed, setSeed] = useState(0), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const alive = useRef(false), pending = useRef(false), seen = useRef(null), currentSelection = useRef(null), trigger = useRef(null);
  const editTrigger = useRef(null), accessTrigger = useRef(null), previousMode = useRef(null);
  currentSelection.current = selectedId;
  const navigate = useNavigate();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setMode(null); setConfirm(false); setError(''); }, [param]);
  useEffect(() => {
    if (!mode && previousMode.current) (previousMode.current === 'edit' ? editTrigger : accessTrigger).current?.focus();
    previousMode.current = mode;
  }, [mode]);
  useEffect(() => {
    if (selected) seen.current = selected.id;
    else if (seen.current === selectedId && !list.loading) {
      seen.current = null; setMode(null); setConfirm(false);
      setNotice('El canal se eliminó o ya no tenés acceso.'); navigate(base, { replace: true });
    }
  }, [selected, selectedId, list.loading, base, navigate]);
  const refresh = () => { refreshCommunity(); list.markStale(); list.reload(); };
  const reloadEditor = async () => {
    refreshCommunity();
    if (await list.reload()) { if (alive.current) setSeed((n) => n + 1); }
  };
  async function move(index, direction) {
    if (pending.current || !canManage) return;
    const orden = list.items.map((c) => c.id);
    [orden[index], orden[index + direction]] = [orden[index + direction], orden[index]];
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await orderChannels(comunidad.id, orden);
      if (alive.current) { setNotice('Orden de canales guardado.'); list.reload(); }
    } catch (e) {
      if (alive.current) { setError(e.code === 'INVALID_ORDER' ? 'La lista de canales cambió. Actualizá y volvé a ordenar.' : e.message); refresh(); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function saved(canal) {
    list.reload(); setMode(null); setNotice(creating ? 'Canal creado.' : 'Canal actualizado.');
    if (creating) navigate(`${base}/${canal.id}`);
  }
  return <>
    <CommunityNav comunidad={comunidad} />
    <header className={`page-heading community-page-heading ${selected ? 'channel-compact-heading' : ''}`}><div>{!selected && <h1>Canales</h1>}<p>{comunidad.nombre}</p></div></header>
    {notice && <p role="status" className="community-success">{notice}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {list.error && <p role="alert" className="notice error">{list.error.message} <button type="button" className="secondary" onClick={refresh}>Reintentar canales</button></p>}
    <div className={`channel-workspace ${selected ? 'has-selected-channel' : ''}`}>
      <ChannelSelector selected={param}>
        <div className="community-actions channel-catalog-actions"><button type="button" className="secondary" disabled={list.refreshing || busy} onClick={refresh}>Actualizar canales</button>
          {canManage && <Link className="button-link" to={`${base}/nuevo`}>Crear canal</Link>}</div>
        <nav aria-label="Canales de la comunidad" className="channel-navigation">
        {list.loading ? <p role="status">Cargando canales…</p> : <>
          {!list.error && list.items.length === 0 && <p>No hay canales disponibles para tu cuenta.</p>}
          <ul className="community-list channel-list">{list.items.map((canal, index) => <li key={canal.id}>
            <Link to={`${base}/${canal.id}`} aria-current={selectedId === canal.id ? 'page' : undefined} className="channel-link" data-type={canal.tipo}>
              <span className="channel-type">{CHANNEL_TYPES[canal.tipo]}</span><strong>{canal.nombre}</strong>
              <span className="community-help">{canal.privado ? 'Privado' : 'Público'}</span>
            </Link>
            {canManage && <div className="channel-order"><button type="button" className="secondary" aria-label={`Subir «${canal.nombre}»`}
              disabled={busy || list.refreshing || index === 0} onClick={() => move(index, -1)}>Subir</button>
              <button type="button" className="secondary" aria-label={`Bajar «${canal.nombre}»`}
                disabled={busy || list.refreshing || index === list.items.length - 1} onClick={() => move(index, 1)}>Bajar</button></div>}
          </li>)}</ul>
        </>}
      </nav></ChannelSelector>
      <section className={`channel-panel ${selected?.tipo === 'TEXTO' && !mode ? 'has-channel-chat' : ''}`} aria-label="Detalle del canal">
        {creating ? canManage ? <ChannelForm key={`new-${comunidad.id}`} idComunidad={comunidad.id} onSaved={saved}
          onCancel={() => navigate(base)} onUnavailable={refresh} /> : <p role="alert">Tu rol no permite crear canales.</p> : selected ? <>
          <header className="channel-detail-heading"><h1>{selected.nombre}</h1><span className="channel-type">{CHANNEL_TYPES[selected.tipo]} · {selected.privado ? 'Privado' : 'Público'}</span></header>
          <p className="community-help">{selected.tipo === 'TEXTO'
            ? selected.misPermisos.includes('ESCRIBIR') ? 'Tenés permisos de lectura y escritura.' : 'Este canal es de solo lectura para tu cuenta.'
            : 'Las llamadas estarán disponibles en una próxima entrega.'}</p>
          {selected.tipo === 'TEXTO' && !mode && <ChannelChat key={selected.id} canal={selected} draft={drafts[selected.id] ?? ''}
            setDraft={(value) => setDrafts((old) => ({ ...old, [selected.id]: typeof value === 'function' ? value(old[selected.id] ?? '') : value }))} />}
          {canManage && !mode && <div className="community-actions channel-detail-actions">
            <button ref={editTrigger} type="button" className="secondary" onClick={() => setMode('edit')}>Editar canal</button>
            <button ref={accessTrigger} type="button" className="secondary" onClick={() => setMode('access')}>Permisos</button>
            <button ref={trigger} type="button" className="secondary danger" onClick={() => setConfirm(true)}>Eliminar canal</button>
          </div>}
          {canManage && mode === 'edit' && <ChannelForm key={`${selected.id}-edit-${seed}`} canal={selected} version={list.version(selected.id)}
            onSaved={saved} onCancel={() => setMode(null)} onReload={reloadEditor} onUnavailable={refresh} />}
          {canManage && mode === 'access' && <ChannelAccessForm key={`${selected.id}-access-${seed}`} canal={selected} version={list.version(selected.id)}
            onSaved={() => { list.reload(); setMode(null); setNotice('Permisos guardados.'); }} onCancel={() => setMode(null)}
            onReload={reloadEditor} onUnavailable={refresh} />}
          {canManage && confirm && <CommunityActionDialog title={`¿Eliminar «${selected.nombre}»?`}
            description="Se eliminarán el canal, sus mensajes y sus habilitaciones. Esta acción no se puede deshacer."
            confirmLabel="Eliminar canal" returnFocusRef={trigger} onClose={() => setConfirm(false)} onConfirm={async () => {
              const id = selected.id;
              try { await deleteChannel(id); }
              catch (e) { if ([403, 404].includes(e.status)) refresh(); throw e; }
              if (!alive.current) return;
              list.mutate((items) => items.filter((c) => c.id !== id)); list.reload(); setNotice('Canal eliminado.');
              if (currentSelection.current === id) navigate(base, { replace: true });
            }} />}
        </> : param && !list.loading && !list.refreshing ? <div className="community-empty"><h2>Canal no disponible</h2>
          <p>El canal no existe o no tenés acceso.</p><Link to={base}>Volver a los canales</Link></div>
          : !param ? <p className="community-help">Elegí un canal para consultar sus detalles.</p> : <p role="status">Cargando canal…</p>}
      </section>
    </div>
  </>;
}

export default function CommunityChannelsPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  return <section className="page-container communities-page channels-page">
    <Link className="community-back" to={detail.valid ? `/comunidades/${id}` : '/comunidades'}>← Volver a la comunidad</Link>
    {!detail.comunidad ? <CommunityState {...detail} /> : <>
      {detail.error && <p role="alert" className="notice error">No se pudo actualizar la comunidad. {detail.error.message}</p>}
      <ChannelsWorkspace key={id} comunidad={detail.comunidad} refreshCommunity={detail.reload} />
    </>}
  </section>;
}
