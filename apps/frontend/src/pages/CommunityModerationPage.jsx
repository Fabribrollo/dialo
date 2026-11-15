import { useState } from 'react';
import { Link, useParams } from 'react-router';
import CommunityNav from '../components/communities/CommunityNav.jsx';
import FormField from '../components/FormField.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityModeration } from '../hooks/useCommunityModeration.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';

const MAX_REGLAS = 10;
const MAX_LARGO = 100;

function ModerationForm({ moderacion, onSave }) {
  const [activa, setActiva] = useState(moderacion.activa);
  const [reglas, setReglas] = useState(moderacion.reglas);
  const [nueva, setNueva] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');

  function add() {
    const regla = nueva.trim();
    if (!regla) return;
    if (regla.length > MAX_LARGO) { setError(`Cada regla puede tener hasta ${MAX_LARGO} caracteres.`); return; }
    if (reglas.some((r) => r.toLowerCase() === regla.toLowerCase())) { setError('Esa regla ya está en la lista.'); return; }
    setReglas([...reglas, regla]);
    setNueva(''); setError(''); setNotice('');
  }
  function remove(regla) {
    setReglas(reglas.filter((r) => r !== regla));
    setNotice('');
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await onSave({ activa, reglas });
      setActiva(saved.activa); setReglas(saved.reglas);
      setNotice('Moderación guardada.');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  return <form className="community-form moderation-form" onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy}>
      <label className="channel-checkbox"><input type="checkbox" checked={activa} onChange={(e) => { setActiva(e.target.checked); setNotice(''); }} /> Moderar mensajes con IA</label>
      <p className="community-help">{activa
        ? 'Antes de publicarse, cada mensaje de los canales se revisa con estas reglas. Si cumple alguna, se bloquea y el autor ve cuál fue.'
        : 'Desactivada: los mensajes se publican sin revisión. Las reglas se guardan para cuando la actives.'}</p>
      <h2>Bloquear el mensaje si contiene…</h2>
      {!reglas.length && <p className="community-help">{activa ? 'Sin reglas no se bloquea ningún mensaje.' : 'Todavía no hay reglas.'}</p>}
      {reglas.length > 0 && <ul className="community-list">{reglas.map((regla) => <li key={regla} className="community-member-row community-role-row">
        <strong>{regla}</strong>
        <button type="button" className="secondary danger" onClick={() => remove(regla)} aria-label={`Quitar ${regla}`}>Quitar</button>
      </li>)}</ul>}
      {reglas.length < MAX_REGLAS
        ? <div className="moderation-add">
          <FormField label="Nueva regla" value={nueva} maxLength={MAX_LARGO} placeholder="acoso o violencia"
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
          <button type="button" className="secondary" onClick={add} disabled={!nueva.trim()}>Agregar</button>
        </div>
        : <p className="community-help">Llegaste al máximo de {MAX_REGLAS} reglas.</p>}
      <button type="submit">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </fieldset>
    {error && <p role="alert" className="notice error">{error}</p>}
    {notice && <p role="status" className="community-success">{notice}</p>}
  </form>;
}

function ModerationSettings({ detail }) {
  const { id, miRol, nombre } = detail.comunidad;
  const allowed = ['ADMIN', 'PROPIETARIO'].includes(miRol);
  const config = useCommunityModeration(id, allowed);

  async function save(datos) {
    try {
      return await config.save(datos);
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) detail.reload();
      throw error;
    }
  }

  return <>
    <header className="page-heading community-page-heading">
      <div><h1>Moderación</h1><p>{nombre}</p></div>
    </header>
    {!allowed ? <p className="center-note">Solo propietarios y administradores pueden configurar la moderación.</p>
      : config.loading ? <p role="status">Cargando moderación…</p>
        : config.error ? <p role="alert" className="notice error">{config.error.message} <button type="button" className="secondary" onClick={config.reload}>Reintentar</button></p>
          : <ModerationForm moderacion={config.moderacion} onSave={save} />}
  </>;
}

export default function CommunityModerationPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  return <section className="page-container communities-page">
    <Link className="community-back" to={detail.valid ? `/comunidades/${id}` : '/comunidades'}>← Volver a la comunidad</Link>
    {!detail.comunidad ? <CommunityState {...detail} /> : <>
      <CommunityNav comunidad={detail.comunidad} />
      <ModerationSettings key={id} detail={detail} />
    </>}
  </section>;
}
