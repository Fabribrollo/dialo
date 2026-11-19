import BlockedMessages from '../components/communities/BlockedMessages.jsx';
import { useState } from 'react';
import { useParams } from 'react-router';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import '../styles/members.css';
import '../styles/moderation.css';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityModeration } from '../hooks/useCommunityModeration.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
const MAX_REGLAS = 10;
const MAX_LARGO = 100;
const SUGERIDAS = ['acoso', 'spam', 'política', 'spoilers', 'insultos', 'datos personales', 'links a otros sitios'];
function ModerationForm({ moderacion, onSave }) {
  const [activa, setActiva] = useState(moderacion.activa);
  const [reglas, setReglas] = useState(moderacion.reglas);
  const [guardada, setGuardada] = useState(moderacion);
  const [nueva, setNueva] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ok, setOk] = useState(false), [saveError, setSaveError] = useState('');
  const dirty = activa !== guardada.activa || reglas.join('\n') !== guardada.reglas.join('\n');
  const bajas = reglas.map((r) => r.toLowerCase());
  const sugeridas = SUGERIDAS.filter((g) => !bajas.includes(g)).slice(0, 6);

  function add(texto = nueva) {
    const regla = texto.trim();
    if (!regla) return;
    if (regla.length > MAX_LARGO) { setError(`Cada regla puede tener hasta ${MAX_LARGO} caracteres.`); return; }
    if (bajas.includes(regla.toLowerCase())) { setError('Esa regla ya está en la lista.'); return; }
    setReglas([...reglas, regla]);
    if (texto === nueva) setNueva('');
    setError(''); setOk(false);
  }
  function remove(regla) {
    setReglas(reglas.filter((r) => r !== regla));
    setOk(false);
  }
  async function save() {
    setBusy(true); setSaveError(''); setOk(false);
    try {
      const saved = await onSave({ activa, reglas });
      setActiva(saved.activa); setReglas(saved.reglas); setGuardada(saved);
      setOk(true);
    } catch (e) {
      setSaveError(e.message);
    } finally { setBusy(false); }
  }

  return <div className="md">
    <Card className="md-card">
      <div className="md-switch-row">
        <span className={`md-ico ${activa ? 'md-ico-on' : ''}`}><Icon name="moderacion" size={23} stroke={2} /></span>
        <h2 className="page-h2 md-h2" id="mod-ia">Moderar mensajes con IA</h2>
        <button type="button" className={`md-sw ${activa ? 'md-sw-on' : ''}`} role="switch" aria-checked={activa} aria-labelledby="mod-ia" disabled={busy}
          onClick={() => { setActiva(!activa); setOk(false); }}><span /></button>
      </div>
    </Card>
    <Card className={`md-card md-rules ${activa ? '' : 'md-off'}`}>
      <div className="md-rules-head"><h2 className="page-h2 md-h2">Bloquear el mensaje si contiene…</h2><span className="bdg bdg-base md-count">{reglas.length} de {MAX_REGLAS}</span></div>
      {reglas.length > 0 && <div className="md-list">{reglas.map((regla) => <span key={regla} className="md-rule">{regla}
        <button type="button" className="pr" onClick={() => remove(regla)} aria-label={`Quitar ${regla}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button></span>)}</div>}
      {reglas.length < MAX_REGLAS ? <>
        <div className="md-new">
          <label className="fl" htmlFor="nueva-regla">Nueva regla</label>
          <div className="md-new-row">
            <span className={`inp md-inp ${error || nueva.length > MAX_LARGO ? 'inp-error' : ''}`}>
              <input id="nueva-regla" type="text" maxLength={120} placeholder="acoso o violencia" value={nueva} disabled={busy}
                onChange={(e) => { setNueva(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
              <span className="md-len">{nueva.length}/{MAX_LARGO}</span>
            </span>
            <Button variant="secundario" onClick={() => add()} disabled={!nueva.trim() || busy}><Icon name="mas" size={17} stroke={2.4} />Agregar</Button>
          </div>
          {error && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />{error}</span>}
        </div>
        {sugeridas.length > 0 && <div className="md-sug-wrap"><span className="li-sub">Sugeridas</span><div className="md-list">
          {sugeridas.map((g) => <button key={g} type="button" className="md-sug pr" onClick={() => add(g)}><Icon name="mas" size={14} stroke={2.4} />{g}</button>)}
        </div></div>}
      </> : <div className="md-max"><Icon name="info" size={18} stroke={2.1} /><span>Llegaste al máximo de {MAX_REGLAS} reglas.</span></div>}
    </Card>
    {saveError && <Notice tone="error" title={saveError} />}
    {dirty && <div className="lg dk md-bar">
      <Icon name="info" size={18} stroke={2.1} />
      <span className="md-bar-text">Tenés cambios sin guardar</span>
      <button type="button" className="btn pr md-discard" disabled={busy} onClick={() => { setActiva(guardada.activa); setReglas(guardada.reglas); setError(''); }}>Descartar</button>
      <Button className="md-save" loading={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
    </div>}
    {!dirty && ok && <div className="md-ok" role="status"><span className="md-ok-ic"><Icon name="check" size={15} stroke={2.6} /></span>Moderación guardada</div>}
  </div>;
}
function ModerationSettings({ detail }) {
  const { id, miRol } = detail.comunidad;
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
  return !allowed ? <Notice tone="conflicto" title="Solo propietarios y administradores pueden configurar la moderación." />
    : config.loading ? <span className="cm-state" role="status"><Spinner size={15} />Cargando moderación…</span>
      : config.error ? <Notice tone="error" title={config.error.message} actionLabel="Reintentar" onAction={config.reload} />
        : <ModerationForm moderacion={config.moderacion} onSave={save} />;
}
export default function CommunityModerationPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad}>
      <ModerationSettings key={`settings-${id}`} detail={detail} />
      {['MODERADOR', 'ADMIN', 'PROPIETARIO'].includes(detail.comunidad.miRol) && <BlockedMessages key={`blocked-${id}`} id={id} />}
  </CommunityShell>;
}
