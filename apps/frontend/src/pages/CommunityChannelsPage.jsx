import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCommunity } from '../hooks/useCommunity.js';
import { useChannels } from '../hooks/useChannels.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import CommunityActionDialog from '../components/communities/CommunityActionDialog.jsx';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import ChannelForm, { CHANNEL_TYPES } from '../components/channels/ChannelForm.jsx';
import ChannelAccessForm from '../components/channels/ChannelAccessForm.jsx';
import ChannelList from '../components/channels/ChannelList.jsx';
import ChannelRail from '../components/channels/ChannelRail.jsx';
import CreateChannelWizard from '../components/channels/CreateChannelWizard.jsx';
import ChannelChat from '../components/channel-chat/ChannelChat.jsx';
import CallPanel from '../components/calls/CallPanel.jsx';
import VoiceSidePanel from '../components/calls/VoiceSidePanel.jsx';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { deleteChannel, orderChannels } from '../services/channelsService.js';
import '../styles/members.css';
import '../components/channels/channelList.css';

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
  const [editing, setEditing] = useState(null);
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
  async function reorder(orden) {
    if (pending.current || !canManage) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await orderChannels(comunidad.id, orden);
      if (alive.current) { setNotice('Orden de canales guardado.'); list.reload(); }
    } catch (e) {
      if (alive.current) { setError(e.code === 'INVALID_ORDER' ? 'La lista de canales cambió. Actualizá y volvé a ordenar.' : e.message); refresh(); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function saved(canal) {
    list.reload(); setMode(null); setEditing(null); setNotice(creating ? 'Canal creado.' : 'Canal actualizado.');
    if (creating) navigate(`${base}/${canal.id}`);
  }
  async function remove(canal) {
    try { await deleteChannel(canal.id); }
    catch (e) { if ([403, 404].includes(e.status)) refresh(); throw e; }
    if (!alive.current) return;
    list.mutate((items) => items.filter((c) => c.id !== canal.id)); list.reload(); setNotice('Canal eliminado.'); setEditing(null);
    if (currentSelection.current === canal.id) navigate(base, { replace: true });
  }

  const texto = list.items.filter((c) => c.tipo === 'TEXTO').length;
  const voz = list.items.length - texto;
  const target = selected ?? editing;

  return <>
    {notice && <Notice tone="exito" title={notice} />}
    {error && <Notice tone="error" title={error} />}
    {list.error && <Notice tone="error" title={list.error.message} actionLabel="Reintentar canales" onAction={refresh} />}

    {!selected && mode !== 'access' && <>
      <div className="chl-bar">
        <span className="chl-count">{list.items.length} {list.items.length === 1 ? 'canal' : 'canales'} · {texto} de texto y {voz} de voz</span>
        <span className="chl-actions">
          <button type="button" className="lg pr ib chl-refresh" aria-label="Actualizar canales" disabled={list.refreshing || busy} onClick={refresh}><Icon name="reintentar" size={17} stroke={2} /></button>
          {canManage && <Button onClick={() => navigate(`${base}/nuevo`)}><Icon name="mas" size={15} stroke={2.2} />Crear canal</Button>}
        </span>
      </div>
      {list.loading ? <span className="cm-state" role="status"><Spinner size={15} />Cargando canales…</span> : <>
        {!list.error && list.items.length === 0 && <EmptyState icon="canalTexto" title="No hay canales disponibles para tu cuenta." />}
        {list.items.length > 0 && <ChannelList items={list.items} base={base} canManage={canManage} disabled={busy || list.refreshing} onReorder={reorder}
          onEdit={(canal, el) => { editTrigger.current = el; setEditing(canal); }} />}
      </>}
      {param && !creating && !list.loading && !list.refreshing && (
        <div className="cs-error"><h2 className="cs-title">Canal no disponible</h2><p className="cs-text">El canal se eliminó o ya no tenés acceso.</p><Button size="sm" onClick={() => navigate(base)}>Volver a los canales</Button></div>
      )}
    </>}

    <Dialog open={creating} onClose={() => navigate(base)} label="Crear canal" className={canManage ? 'ccw-dialog' : 'chd-dialog'}>
      {canManage ? <CreateChannelWizard key={`new-${comunidad.id}`} idComunidad={comunidad.id} onCancel={() => navigate(base)}
        onCreated={() => { list.reload(); setNotice('Canal creado.'); }} onOpen={(canal) => navigate(`${base}/${canal.id}`)} />
        : <Notice tone="error" title="Tu rol no permite crear canales." />}
    </Dialog>

    <Dialog open={Boolean(editing) && mode !== 'access'} onClose={() => setEditing(null)} label="Editar canal" className="chd-dialog" returnFocusRef={editTrigger}>
      {editing && <ChannelForm key={`${editing.id}-edit-${seed}`} canal={editing} version={list.version(editing.id)}
        onSaved={saved} onCancel={() => setEditing(null)} onReload={reloadEditor} onUnavailable={refresh}
        onEditAccess={() => setMode('access')} onDelete={(el) => { trigger.current = el; setConfirm(true); }} />}
    </Dialog>

    {selected && <section className="chd" aria-label="Detalle del canal">
      <header className="chd-head">
        <Link to={base} className="lg pr dm-back" aria-label="Volver"><span><Icon name="chevron" size={18} stroke={2} /></span></Link>
        <span className="chd-title">
          <h1 className="dsp"><Icon name={selected.tipo === 'TEXTO' ? 'canalTexto' : 'canalVoz'} size={26} stroke={2.2} />{selected.nombre}</h1>
          <span className="chd-sub">{CHANNEL_TYPES[selected.tipo]} · {selected.privado ? 'Privado' : 'Público'}</span>
        </span>
        {canManage && !mode && <span className="chd-actions">
          <Button ref={editTrigger} size="sm" variant="secundario" onClick={() => setMode('edit')}>Editar canal</Button>
          <Button ref={accessTrigger} size="sm" variant="secundario" onClick={() => setMode('access')}>Permisos</Button>
        </span>}
      </header>
      <ChannelRail items={list.items} base={base} selectedId={selected.id} />
      {selected.tipo === 'TEXTO' && !selected.misPermisos.includes('ESCRIBIR') && <Notice tone="conflicto" title="Este canal es de solo lectura para tu cuenta">Podés leer, pero no escribir.</Notice>}
      {selected.tipo !== 'TEXTO' && !mode && <CallPanel key={selected.id} canal={selected} />}
      {selected.tipo === 'TEXTO' && <VoiceSidePanel canales={list.items.filter((c) => c.tipo !== 'TEXTO')} base={base} />}
      {selected.tipo === 'TEXTO' && !mode && <ChannelChat key={selected.id} canal={selected} draft={drafts[selected.id] ?? ''}
        setDraft={(value) => setDrafts((old) => ({ ...old, [selected.id]: typeof value === 'function' ? value(old[selected.id] ?? '') : value }))} />}
      {canManage && mode === 'edit' && <div className="chd-panel"><ChannelForm key={`${selected.id}-edit-${seed}`} canal={selected} version={list.version(selected.id)}
        onSaved={saved} onCancel={() => setMode(null)} onReload={reloadEditor} onUnavailable={refresh} /></div>}
    </section>}

    {canManage && mode === 'access' && target && <ChannelAccessForm key={`${target.id}-access-${seed}`} canal={target} version={list.version(target.id)}
      onSaved={() => { list.reload(); setMode(null); setEditing(null); setNotice('Permisos guardados.'); }} onCancel={() => setMode(null)}
      onReload={reloadEditor} onUnavailable={refresh} />}

    {canManage && confirm && target && <CommunityActionDialog title={`¿Eliminar «${target.nombre}»?`}
      description="Se eliminan el canal, sus mensajes y sus permisos. No se puede deshacer."
      confirmLabel="Eliminar canal" returnFocusRef={trigger} onClose={() => setConfirm(false)} onConfirm={() => remove(target)} />}
  </>;
}

export default function CommunityChannelsPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const { canalId } = useParams();
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad} collapsible={/^\d+$/.test(canalId ?? '')}>
    {detail.error && <Notice tone="error" title="No se pudo actualizar la comunidad." actionLabel="Reintentar" onAction={detail.reload} />}
    <ChannelsWorkspace key={id} comunidad={detail.comunidad} refreshCommunity={detail.reload} />
  </CommunityShell>;
}
