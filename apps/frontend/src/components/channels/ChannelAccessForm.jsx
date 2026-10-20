import { useEffect, useRef, useState } from 'react';
import FormField from '../FormField.jsx';
import { getCommunityMembers } from '../../services/communitiesService.js';
import { getChannelAccess, replaceChannelAccess } from '../../services/channelsService.js';

const LABELS = { VER: 'Ver', ESCRIBIR: 'Escribir', HABLAR: 'Hablar', TRANSMITIR: 'Transmitir cámara o pantalla' };
const keyFor = (grant) => grant.rol ? `rol:${grant.rol}` : `user:${grant.usuario.id}`;

export default function ChannelAccessForm({ canal, version, onSaved, onCancel, onReload, onUnavailable }) {
  const [config, setConfig] = useState(null), [members, setMembers] = useState([]), [grants, setGrants] = useState({});
  const [privado, setPrivado] = useState(false), [target, setTarget] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), [stale, setStale] = useState(false);
  const initialVersion = useRef(version), pending = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setError(''); setConfig(null);
    Promise.all([getChannelAccess(canal.id), getCommunityMembers(canal.idComunidad)]).then(([{ acceso }, { items }]) => {
      if (!active) return;
      setConfig(acceso); setPrivado(acceso.privado); setMembers(items);
      setGrants(Object.fromEntries(acceso.habilitaciones.map((g) => [keyFor(g), { ...g, permisos: g.permisos }])));
    }).catch((e) => { if (active) { setError(e.message); if ([403, 404].includes(e.status)) onUnavailable(); } });
    return () => { active = false; };
  }, [canal.id, canal.idComunidad, attempt]); // onUnavailable no interviene en la carga.
  useEffect(() => { if (initialVersion.current !== version && !pending.current) setStale(true); }, [version, busy]);
  const allowed = canal.tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR', 'TRANSMITIR'];
  const individual = Object.entries(grants).filter(([key]) => key.startsWith('user:'));
  function toggle(key, permission, checked) {
    setGrants((old) => {
      const grant = old[key] ?? { rol: key.slice(4), permisos: [] };
      const values = new Set(grant.permisos);
      if (checked) { values.add(permission); values.add('VER'); }
      else if (permission === 'VER') values.clear();
      else values.delete(permission);
      return { ...old, [key]: { ...grant, permisos: [...values] } };
    });
  }
  function row(key, label) {
    const grant = grants[key];
    const extra = grant?.permisos.filter((p) => !allowed.includes(p)) ?? [];
    return <fieldset key={key} className="channel-permission-row">
      <legend>{label}</legend>
      <div className="channel-permission-options">{allowed.map((permission) => <label key={permission} className="channel-checkbox">
        <input type="checkbox" aria-label={`${label}: ${LABELS[permission]}`} checked={grant?.permisos.includes(permission) ?? false}
          onChange={(e) => toggle(key, permission, e.target.checked)} />{LABELS[permission]}</label>)}</div>
      {extra.length > 0 && <p className="community-help">También conserva permisos para otros tipos: {extra.map((p) => LABELS[p]).join(', ')}.</p>}
      {key.startsWith('user:') && <button type="button" className="secondary" onClick={() => setGrants((old) => {
        const next = { ...old }; delete next[key]; return next;
      })}>Quitar habilitación de {label}</button>}
    </fieldset>;
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || stale || !config) return;
    const habilitaciones = Object.values(grants).filter((g) => g.permisos.length).map((g) => ({
      ...(g.rol ? { rol: g.rol } : { idUsuario: g.usuario.id }), permisos: g.permisos,
    }));
    if (habilitaciones.length > 50) { setError('Podés guardar hasta 50 habilitaciones por canal.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      await replaceChannelAccess(canal.id, { privado, habilitaciones });
      if (alive.current) onSaved();
    } catch (e) {
      if (alive.current) {
        setError(e.code === 'MEMBER_NOT_FOUND' ? 'Un integrante ya no pertenece a la comunidad. Recargá el formulario para actualizar la lista.' : e.message);
        if (e.code === 'MEMBER_NOT_FOUND') setStale(true);
        else if ([403, 404].includes(e.status)) onUnavailable();
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <form className="channel-access-form" onSubmit={submit} aria-busy={busy}>
    <h2>Permisos de {canal.nombre}</h2>
    {stale && <p role="alert" className="notice error">La configuración pudo cambiar. Recargá el formulario antes de guardar.
      <button type="button" className="secondary" onClick={onReload}>Recargar formulario</button></p>}
    {error && <p role="alert" className="notice error">{error} {!config && <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>Reintentar permisos</button>}</p>}
    {!config && !error && <p role="status">Cargando permisos e integrantes…</p>}
    {config && <fieldset disabled={busy || stale} className="channel-access-fields">
      <label className="channel-checkbox"><input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} /> Canal privado</label>
      <p className="community-help">{privado ? 'Solo tendrán acceso los roles e integrantes habilitados.' : canal.tipo === 'TEXTO'
        ? 'Todos los integrantes pueden ver y escribir. Las habilitaciones agregan permisos; no los restringen.'
        : 'Todos los integrantes pueden ver y hablar. Las habilitaciones agregan permisos; no los restringen.'}</p>
      <p className="community-help">Propietario y administradores siempre tienen acceso completo. Para un canal de solo lectura, elegí privado y habilitá únicamente Ver.</p>
      <h3>Por rol</h3>
      {row('rol:MODERADOR', 'Moderadores')}{row('rol:INTEGRANTE', 'Integrantes')}
      <h3>Por integrante</h3>
      {individual.map(([key, grant]) => row(key, `${grant.usuario.nombreVisible} (@${grant.usuario.nombreUsuario})`))}
      <div className="channel-add-member">
        <FormField as="select" label="Integrante a habilitar" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Elegir integrante</option>
          {members.filter((m) => !['PROPIETARIO', 'ADMIN'].includes(m.rol) && !grants[`user:${m.usuario.id}`])
            .map(({ usuario }) => <option key={usuario.id} value={usuario.id}>{usuario.nombreVisible} (@{usuario.nombreUsuario})</option>)}
        </FormField>
        <button type="button" className="secondary" disabled={!target} onClick={() => {
          const member = members.find((m) => String(m.usuario.id) === target);
          if (member) setGrants((old) => ({ ...old, [`user:${target}`]: { usuario: member.usuario, permisos: ['VER'] } }));
          setTarget('');
        }}>Agregar integrante</button>
      </div>
      <button type="submit">{busy ? 'Guardando…' : 'Guardar permisos'}</button>
    </fieldset>}
    <button type="button" className="secondary channel-cancel" disabled={busy} onClick={onCancel}>Cancelar</button>
  </form>;
}
