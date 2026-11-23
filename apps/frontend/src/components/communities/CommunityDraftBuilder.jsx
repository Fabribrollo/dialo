import { useEffect, useRef, useState } from 'react';
import { suggestCommunity } from '../../services/communitiesService.js';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Notice from '../ui/Notice.jsx';
import PermissionPills from '../channels/PermissionPills.jsx';
import './communityDraft.css';

const channel = () => ({ nombre: '', tipo: 'TEXTO', privado: false, permisosGlobales: ['ESCRIBIR'] });

export default function CommunityDraftBuilder({ value, onChange, onGenerated, purpose, onPurpose, disabled, onBusy }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [generated, setGenerated] = useState(0);
  const alive = useRef(true), pending = useRef(false), version = useRef(0), heading = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current++; onBusy(false); }; }, [onBusy]);
  useEffect(() => { if (generated) heading.current?.focus(); }, [generated]);
  const channels = value?.canales ?? [], roles = value?.roles ?? [];
  async function generate() {
    if (pending.current || disabled || purpose.trim().length < 10) return;
    pending.current = true; setBusy(true); onBusy(true); setError('');
    const current = ++version.current;
    try {
      const { propuesta } = await suggestCommunity({ proposito: purpose.trim() });
      if (alive.current && current === version.current) { onGenerated(propuesta); setGenerated(count => count + 1); }
    } catch (e) { if (alive.current && current === version.current) setError(e.message); }
    finally { if (alive.current && current === version.current) { pending.current = false; setBusy(false); onBusy(false); } }
  }
  function cancel() {
    version.current++; pending.current = false; setBusy(false); onBusy(false); setError(''); onChange(null);
  }
  const change = (key, index, next) => onChange({ ...value, [key]: value[key].map((item, i) => i === index ? { ...item, ...next } : item) });
  const move = (index, delta) => {
    const next = [...channels]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange({ ...value, canales: next });
  };
  return <section className="community-draft" aria-label="Estructura con IA">
    <h2>Una comunidad a tu medida</h2>
    <p>Contá para quién es y cómo se van a organizar. La propuesta se puede editar antes de crearla.</p>
    <Field as="textarea" label="Propósito de la comunidad" value={purpose} onChange={e => onPurpose(e.target.value)} maxLength={1200} disabled={busy || disabled} placeholder="Ej. Un grupo de estudio de programación, con consultas, recursos y salas para estudiar juntos." />
    <div className="cd-actions">
      <Button onClick={generate} disabled={busy || disabled || purpose.trim().length < 10} loading={busy}>{value ? 'Generar otra propuesta' : 'Generar propuesta'}</Button>
      {(value || busy) && <Button variant="secundario" onClick={cancel} disabled={disabled}>Descartar propuesta</Button>}
    </div>
    <span role="status">{busy ? 'Preparando la estructura. Todavía no se creó ninguna comunidad.' : ''}</span>
    {error && <Notice tone="error" title={error} />}
    {value && <fieldset className="cd-editor" disabled={busy || disabled}>
      <legend ref={heading} tabIndex={-1}>Revisá la estructura</legend>
      <p>Nombre y privacidad se editan debajo. El orden de esta lista será el de tus canales. Los roles quedan sin asignar.</p>
      <h3>Canales ({channels.length}/20)</h3>
      {channels.map((item, index) => <fieldset key={index} className="cd-item">
        <legend>Canal {index + 1}</legend>
        <div className="cd-fields">
          <Field label={`Nombre del canal ${index + 1}`} value={item.nombre} maxLength={32} onChange={e => change('canales', index, { nombre: e.target.value })} />
          <Field as="select" label={`Tipo del canal ${index + 1}`} value={item.tipo} onChange={e => change('canales', index, { tipo: e.target.value, permisosGlobales: item.privado ? [] : e.target.value === 'TEXTO' ? ['ESCRIBIR'] : ['HABLAR'] })}><option value="TEXTO">Texto</option><option value="VOZ">Voz</option></Field>
        </div>
        <label className="cd-private"><input type="checkbox" checked={item.privado} onChange={e => change('canales', index, { privado: e.target.checked, permisosGlobales: e.target.checked ? [] : item.tipo === 'TEXTO' ? ['ESCRIBIR'] : ['HABLAR'] })} />Privado: canal {index + 1}</label>
        {item.privado ? <p>Las personas se admiten después de crear la comunidad.</p> : <PermissionPills tipo={item.tipo} value={item.permisosGlobales} label={`Canal ${index + 1}`} onChange={permisosGlobales => change('canales', index, { permisosGlobales })} />}
        <div className="cd-actions">
          <Button size="sm" variant="secundario" disabled={index === 0} aria-label={`Subir canal ${index + 1}`} onClick={() => move(index, -1)}>Subir</Button>
          <Button size="sm" variant="secundario" disabled={index === channels.length - 1} aria-label={`Bajar canal ${index + 1}`} onClick={() => move(index, 1)}>Bajar</Button>
          <Button size="sm" variant="secundario" aria-label={`Quitar canal ${index + 1}`} onClick={() => onChange({ ...value, canales: channels.filter((_, i) => i !== index) })}>Quitar</Button>
        </div>
      </fieldset>)}
      <Button variant="secundario" disabled={channels.length >= 20} onClick={() => onChange({ ...value, canales: [...channels, channel()] })}>Agregar canal</Button>
      <h3>Roles ({roles.length}/10)</h3>
      <p>Tu cuenta será la propietaria. Estos roles no otorgan propiedad ni administración.</p>
      {roles.map((item, index) => <fieldset key={index} className="cd-item">
        <legend>Rol {index + 1}</legend>
        <Field label={`Nombre del rol ${index + 1}`} value={item.nombre} maxLength={32} onChange={e => change('roles', index, { nombre: e.target.value })} />
        <PermissionPills tipo="TODOS" value={item.permisos} label={`Rol ${index + 1}`} onChange={permisos => change('roles', index, { permisos })} />
        <Button size="sm" variant="secundario" aria-label={`Quitar rol ${index + 1}`} onClick={() => onChange({ ...value, roles: roles.filter((_, i) => i !== index) })}>Quitar rol</Button>
      </fieldset>)}
      <Button variant="secundario" disabled={roles.length >= 10} onClick={() => onChange({ ...value, roles: [...roles, { nombre: '', permisos: [] }] })}>Agregar rol</Button>
    </fieldset>}
  </section>;
}
