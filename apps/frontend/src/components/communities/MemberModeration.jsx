import { useId, useRef, useState } from 'react';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import CommunityRoleFormDialog from './CommunityRoleFormDialog.jsx';
import {
  silenceCommunityMember, liftCommunitySilence, prepareModerationProposal, confirmModerationProposal, cancelModerationProposal,
} from '../../services/communityModerationService.js';
import './memberModeration.css';

// F-14. Misma jerarquía que el servidor: nadie sobre sí mismo ni sobre el propietario,
// solo el propietario sobre administradores y solo administración sobre moderadores.
const isAdmin = (rol) => ['ADMIN', 'PROPIETARIO'].includes(rol);
export const canActOn = (actor, userId, member) => !!member && member.usuario.id !== userId && member.rol !== 'PROPIETARIO'
  && (member.rol !== 'ADMIN' || actor === 'PROPIETARIO') && (member.rol !== 'MODERADOR' || isAdmin(actor));
export const canSilence = (actor, permissions = []) => isAdmin(actor) || permissions.includes('SILENCIAR');
export const canSilenceMember = (actor, userId, member, permissions = []) => canSilence(actor, permissions) && canActOn(actor, userId, member) && member.rol !== 'ADMIN';
export const canUseAssistant = (actor, permissions = []) => canSilence(actor, permissions);

export const ALCANCES = [['AMBOS', 'Texto y voz'], ['TEXTO', 'Solo texto'], ['VOZ', 'Solo voz']];
export const DURACIONES = [['15_MIN', '15 minutos'], ['1_HORA', '1 hora'], ['24_HORAS', '24 horas'], ['7_DIAS', '7 días'], ['PERMANENTE', 'Hasta que lo levantes']];
const ALCANCE_CORTO = { AMBOS: 'texto y voz', TEXTO: 'texto', VOZ: 'voz' };

export function silenceLabel(silencio) {
  if (!silencio) return '';
  const hasta = silencio.fechaVencimiento ? `hasta ${new Date(silencio.fechaVencimiento).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sin vencimiento';
  return `Silenciado en ${ALCANCE_CORTO[silencio.alcance]}, ${hasta}`;
}

export function SilenceMemberDialog({ id, member, blocked, onClose, onDone, returnFocusRef, fallbackFocusRef }) {
  const [alcance, setAlcance] = useState('AMBOS'), [duracion, setDuracion] = useState('1_HORA'), [motivo, setMotivo] = useState('');
  return <CommunityRoleFormDialog title={`Silenciar a ${member.usuario.nombreVisible}`} confirmLabel="Silenciar" destructive
    blocked={blocked} onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
    onSave={async () => {
      await silenceCommunityMember(id, member.usuario.id, { alcance, duracion, motivo: motivo.trim() });
      onDone?.();
      return `${member.usuario.nombreVisible} quedó silenciado.`;
    }}>
    <p>Sigue en la comunidad y puede leer. Según el alcance, no podrá escribir en los canales de texto o usar micrófono, cámara y pantalla en los de voz. Si está en una llamada, se le corta el micrófono.</p>
    <Field as="select" label="Alcance" value={alcance} onChange={(e) => setAlcance(e.target.value)}>
      {ALCANCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Field>
    <Field as="select" label="Duración" value={duracion} onChange={(e) => setDuracion(e.target.value)}>
      {DURACIONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Field>
    <Field as="textarea" label="Motivo (opcional)" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
  </CommunityRoleFormDialog>;
}

export function LiftSilenceDialog({ id, member, silencio, onClose, onDone, returnFocusRef, fallbackFocusRef }) {
  return <CommunityRoleFormDialog title={`Quitar el silencio de ${member.usuario.nombreVisible}`} confirmLabel="Quitar silencio"
    onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
    onSave={async () => {
      await liftCommunitySilence(id, member.usuario.id);
      onDone?.();
      return `${member.usuario.nombreVisible} puede volver a participar.`;
    }}>
    <p>{silenceLabel(silencio)}. Al quitarlo recupera sus permisos en todos los canales.</p>
  </CommunityRoleFormDialog>;
}

// T-51 / T-52: el moderador describe la medida, revisa cómo se interpretó y la confirma o cancela.
export function ModerationAssistant({ id, onApplied }) {
  const [pedido, setPedido] = useState(''), [result, setResult] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(''), [done, setDone] = useState('');
  const [choice, setChoice] = useState(null), [open, setOpen] = useState(false);
  const pending = useRef(false), headingId = useId();

  async function run(kind, task) {
    if (pending.current) return;
    pending.current = true; setBusy(kind); setError('');
    try { await task(); } catch (e) { setError(e.message); } finally { pending.current = false; setBusy(''); }
  }
  const prepare = (idDestinatario) => run('preparar', async () => {
    setDone(''); setResult(null);
    const data = await prepareModerationProposal(id, pedido.trim(), idDestinatario);
    setResult(data); setChoice(data.candidatos?.[0]?.id ?? null);
  });
  const confirm = () => run('confirmar', async () => {
    await confirmModerationProposal(id, result.propuesta.id);
    setDone(`Listo: ${result.propuesta.titulo.toLowerCase()} a ${result.propuesta.destinatario.nombreVisible}.`);
    setResult(null); setPedido(''); onApplied?.();
  });
  const cancel = () => run('cancelar', async () => {
    if (result?.propuesta?.id) await cancelModerationProposal(id, result.propuesta.id);
    setResult(null); setDone('Cancelaste la propuesta. No se aplicó ninguna medida.');
  });

  const propuesta = result?.propuesta;
  return <section className="mm-assistant" aria-labelledby={headingId}>
    <header className="mm-head">
      <span className="mm-ic" aria-hidden="true"><Icon name="moderacion" size={18} stroke={2} /></span>
      <span className="mm-title"><h2 id={headingId}>Moderar con IA</h2><p>Describí la medida. Revisás la propuesta antes de aplicarla.</p></span>
      <Button size="sm" variant="secundario" aria-expanded={open} aria-controls={`${headingId}-panel`} onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Escribir pedido'}</Button>
    </header>
    {open && <div id={`${headingId}-panel`} className="mm-panel">
    <form className="mm-form" onSubmit={(e) => { e.preventDefault(); if (pedido.trim().length >= 5) prepare(); }}>
      <Field as="textarea" label="Pedido" maxLength={600} placeholder="Ej.: silenciá a @beto en el chat por una hora, está haciendo spam"
        value={pedido} onChange={(e) => { setPedido(e.target.value); setResult(null); setDone(''); }} disabled={Boolean(busy)} />
      <div className="mm-actions">
        <Button type="submit" variant="secundario" loading={busy === 'preparar'} disabled={pedido.trim().length < 5 || Boolean(busy)}>Preparar propuesta</Button>
      </div>
    </form>
    <div aria-live="polite">
      {error && <Notice title={error} />}
      {done && <Notice tone="exito" title={done} />}
      {result?.estado === 'AMBIGUO' && <div className="mm-card">
        <p className="mm-msg">{result.mensaje}</p>
        <fieldset className="mm-candidates">
          <legend className="sr-only">Integrante</legend>
          {result.candidatos.map((u) => <label key={u.id} className="mm-candidate">
            <input type="radio" name="mm-candidato" checked={choice === u.id} onChange={() => setChoice(u.id)} />
            <Avatar idUsuario={u.id} nombre={u.nombreVisible} foto={u.fotoUrl} color={u.colorAvatar} size={28} />
            <span><b>{u.nombreVisible}</b> <small>@{u.nombreUsuario}</small></span>
          </label>)}
        </fieldset>
        <div className="mm-actions"><Button size="sm" disabled={!choice || Boolean(busy)} loading={busy === 'preparar'} onClick={() => prepare(choice)}>Usar esta persona</Button></div>
      </div>}
      {propuesta && <div className={`mm-card${result.confirmable ? '' : ' mm-card-blocked'}`}>
        <div className="mm-who">
          <Avatar idUsuario={propuesta.destinatario.id} nombre={propuesta.destinatario.nombreVisible} foto={propuesta.destinatario.fotoUrl} color={propuesta.destinatario.colorAvatar} size={40} />
          <span><b>{propuesta.titulo}</b><small>{propuesta.destinatario.nombreVisible} · @{propuesta.destinatario.nombreUsuario} · {propuesta.comunidad.nombre}</small></span>
        </div>
        {propuesta.motivo && <p className="mm-reason">Motivo: {propuesta.motivo}</p>}
        <ul className="mm-effects">{propuesta.efectos.map((e) => <li key={e}>{e}</li>)}</ul>
        {!result.confirmable && <Notice title={result.mensaje} />}
        {result.confirmable && propuesta.venceEn && <small className="mm-expiry">La propuesta vence a las {new Date(propuesta.venceEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</small>}
        <div className="mm-actions">
          <Button size="sm" variant="secundario" disabled={Boolean(busy)} loading={busy === 'cancelar'} onClick={cancel}>{result.confirmable ? 'Cancelar' : 'Cerrar'}</Button>
          {result.confirmable && <Button size="sm" variant="peligro" disabled={Boolean(busy)} loading={busy === 'confirmar'} onClick={confirm}>Confirmar medida</Button>}
        </div>
      </div>}
    </div>
    </div>}
  </section>;
}
