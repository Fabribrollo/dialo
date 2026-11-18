import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../hooks/useSocket.js';
import { EVENTS } from '../../constants/events.js';
import { getCommunityRoles } from '../../services/communityRolesService.js';
import Field, { CheckField } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Notice from '../ui/Notice.jsx';
import { Spinner } from '../ui/Icon.jsx';
import './channelAccess.css';
import { getCommunityMembers } from '../../services/communitiesService.js';
import { getChannelAccess, replaceChannelAccess } from '../../services/channelsService.js';

const LABELS = { VER: 'Ver', ESCRIBIR: 'Escribir', HABLAR: 'Hablar', TRANSMITIR: 'Transmitir cámara o pantalla' };
const keyFor = (grant) => grant.rol ? `rol:${grant.rol}` : grant.rolPersonalizado ? `custom:${grant.rolPersonalizado.id}` : `user:${grant.usuario.id}`;

export default function ChannelAccessForm({ canal, version, onSaved, onCancel, onReload, onUnavailable }) {
  const socket = useSocket();
  const [roles, setRoles] = useState([]), [roleTarget, setRoleTarget] = useState('');
  const [config, setConfig] = useState(null), [members, setMembers] = useState([]), [grants, setGrants] = useState({});
  const [privado, setPrivado] = useState(false), [target, setTarget] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), [stale, setStale] = useState(false);
  const initialVersion = useRef(version), pending = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!socket) return;
    const invalidate = ({ idComunidad }) => {
      if (idComunidad === canal.idComunidad) setStale(true);
    };
    const events = [EVENTS.COMMUNITY_ROLE_CREATED, EVENTS.COMMUNITY_ROLE_UPDATED, EVENTS.COMMUNITY_ROLE_DELETED, EVENTS.COMMUNITY_MEMBER_LEFT];
    events.forEach((event) => socket.on(event, invalidate));
    return () => events.forEach((event) => socket.off(event, invalidate));
  }, [socket, canal.idComunidad]);
  useEffect(() => {
    let active = true;
    setError(''); setConfig(null);
    Promise.all([getChannelAccess(canal.id), getCommunityMembers(canal.idComunidad), getCommunityRoles(canal.idComunidad)]).then(([{ acceso }, { items }, { items: catalog }]) => {
      if (!active) return;
      setRoles(catalog);
      setConfig(acceso); setPrivado(acceso.privado); setMembers(items);
      setGrants(Object.fromEntries(acceso.habilitaciones.map((g) => [keyFor(g), { ...g, permisos: g.permisos }])));
    }).catch((e) => { if (active) { setError(e.message); if ([403, 404].includes(e.status)) onUnavailable(); } });
    return () => { active = false; };
  }, [canal.id, canal.idComunidad, attempt]); // onUnavailable no interviene en la carga.
  useEffect(() => { if (initialVersion.current !== version && !pending.current) setStale(true); }, [version, busy]);
  const allowed = canal.tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR', 'TRANSMITIR'];
  const custom = Object.entries(grants).filter(([key]) => key.startsWith('custom:'));
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
  function row(key, label, sub, aria = label) {
    const grant = grants[key];
    const extra = grant?.permisos.filter((p) => !allowed.includes(p)) ?? [];
    return <fieldset key={key} className="cpa-row">
      <legend className="sr-only">{aria}</legend>
      <span className="cpa-who"><span className="li-title">{label}</span>{sub && <span className="li-sub">{sub}</span>}
        {extra.length > 0 && <span className="li-sub">También conserva permisos para otros tipos: {extra.map((p) => LABELS[p]).join(', ')}.</span>}</span>
      <span className="cpa-pills">{allowed.map((permission) => <label key={permission} className={`cpa-pill ${grant?.permisos.includes(permission) ? 'cpa-on' : ''}`}>
        <input type="checkbox" aria-label={`${aria}: ${LABELS[permission]}`} checked={grant?.permisos.includes(permission) ?? false}
          onChange={(e) => toggle(key, permission, e.target.checked)} />{LABELS[permission]}</label>)}</span>
      {!key.startsWith('rol:') && <button type="button" className="li-quiet cm-ban pr" aria-label={`Quitar habilitación de ${aria}`} onClick={() => setGrants((old) => {
        const next = { ...old }; delete next[key]; return next;
      })}>Quitar</button>}
    </fieldset>;
  }  async function submit(event) {
    event.preventDefault();
    if (pending.current || stale || !config) return;
    const habilitaciones = Object.values(grants).filter((g) => g.permisos.length).map((g) => ({
      ...(g.rol ? { rol: g.rol } : g.rolPersonalizado ? { idRol: g.rolPersonalizado.id } : { idUsuario: g.usuario.id }), permisos: g.permisos,
    }));
    if (habilitaciones.length > 50) { setError('Podés guardar hasta 50 habilitaciones por canal.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      await replaceChannelAccess(canal.id, { privado, habilitaciones });
      if (alive.current) onSaved();
    } catch (e) {
      if (alive.current) {
        const changed = ['MEMBER_NOT_FOUND', 'ROLE_NOT_FOUND'].includes(e.code) || e.status === 409;
        setError(e.code === 'MEMBER_NOT_FOUND' ? 'Un integrante ya no pertenece a la comunidad. Recargá el formulario para actualizar la lista.'
          : changed ? 'Las habilitaciones cambiaron. Recargá el formulario para consultar la configuración vigente.' : e.message);
        if (changed) setStale(true);
        else if ([403, 404].includes(e.status)) onUnavailable();
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <form className="cpa" onSubmit={submit} aria-busy={busy}>
    <div className="cpa-head">
      <h2 className="dsp">Permisos de {canal.tipo === 'TEXTO' ? '#' : ''}{canal.nombre}</h2>
      {privado && <span className="li-sub cpa-sub">Solo tienen acceso los roles e integrantes habilitados.</span>}
    </div>
    {stale && <Notice tone="conflicto" role="alert" title="La configuración cambió" actionLabel="Recargar formulario" onAction={onReload}>Recargá el formulario antes de guardar.</Notice>}
    {error && <Notice tone="error" title={error} actionLabel={!config ? 'Reintentar permisos' : undefined} onAction={() => setAttempt((n) => n + 1)} />}
    {!config && !error && <span className="cm-state" role="status"><Spinner size={15} />Cargando permisos, roles e integrantes…</span>}
    {config && <fieldset disabled={busy || stale} className="cpa-fields">
      <CheckField label="Canal privado" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
      <Notice tone="conflicto" title="Propietario y administradores siempre tienen acceso completo">Para un canal de solo lectura, habilitá únicamente Ver.</Notice>
      <div className="cpa-cols">
        <Card className="cpa-col">
          <h3 className="page-h2 cpa-h3">Roles</h3>
          {row('rol:MODERADOR', 'Moderador', 'Rol base', 'Moderadores')}{row('rol:INTEGRANTE', 'Integrante', 'Rol base', 'Integrantes')}
          <span className="cpa-sep">Personalizados</span>
          {custom.map(([key, grant]) => row(key, grant.rolPersonalizado.nombre))}
          {roles.length ? <div className="cpa-add">
            <Field as="select" label="Rol personalizado a habilitar" value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)}>
              <option value="">Elegir rol</option>
              {roles.filter((role) => !grants[`custom:${role.id}`]).map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
            </Field>
            <Button size="sm" variant="secundario" disabled={!roleTarget} onClick={() => {
              const role = roles.find((item) => String(item.id) === roleTarget);
              if (role) setGrants((old) => ({ ...old, [`custom:${role.id}`]: { rolPersonalizado: role, permisos: ['VER'] } }));
              setRoleTarget('');
            }}>Agregar rol</Button>
          </div> : <span className="li-sub">No hay roles personalizados. Podés crearlos desde la pestaña Roles.</span>}
        </Card>
        <Card className="cpa-col">
          <h3 className="page-h2 cpa-h3">Integrantes</h3>
          {individual.map(([key, grant]) => row(key, grant.usuario.nombreVisible, `@${grant.usuario.nombreUsuario}`, `${grant.usuario.nombreVisible} (@${grant.usuario.nombreUsuario})`))}
          <div className="cpa-add">
            <Field as="select" label="Integrante a habilitar" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Elegir integrante</option>
              {members.filter((m) => !['PROPIETARIO', 'ADMIN'].includes(m.rol) && !grants[`user:${m.usuario.id}`])
                .map(({ usuario }) => <option key={usuario.id} value={usuario.id}>{usuario.nombreVisible} (@{usuario.nombreUsuario})</option>)}
            </Field>
            <Button size="sm" variant="secundario" disabled={!target} onClick={() => {
              const member = members.find((m) => String(m.usuario.id) === target);
              if (member) setGrants((old) => ({ ...old, [`user:${target}`]: { usuario: member.usuario, permisos: ['VER'] } }));
              setTarget('');
            }}>Agregar integrante</Button>
          </div>
        </Card>
      </div>
    </fieldset>}
    <div className="cpa-actions">
      <Button variant="secundario" disabled={busy} onClick={onCancel}>Cancelar</Button>
      {config && <Button type="submit" loading={busy} disabled={stale}>{busy ? 'Guardando…' : 'Guardar permisos'}</Button>}
    </div>
  </form>;}
