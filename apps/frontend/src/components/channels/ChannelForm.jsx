import { useEffect, useRef, useState } from 'react';
import FormField from '../FormField.jsx';
import * as service from '../../services/channelsService.js';

export const CHANNEL_TYPES = { TEXTO: 'Texto', VOZ: 'Voz', VIDEO: 'Video' };

export default function ChannelForm({ idComunidad, canal, version, onSaved, onCancel, onReload, onUnavailable }) {
  const [nombre, setNombre] = useState(canal?.nombre ?? '');
  const [tipo, setTipo] = useState(canal?.tipo ?? 'TEXTO');
  const [privado, setPrivado] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const initialVersion = useRef(version), pending = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (canal && initialVersion.current !== version && !pending.current) setStale(true); }, [canal, version, busy]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current || stale) return;
    if (!nombre.trim() || nombre !== nombre.trim() || nombre.length > 32) {
      setError('Usá entre 1 y 32 caracteres, sin espacios al principio ni al final.'); return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const datos = { nombre, tipo, ...(!canal && { privado }) };
      const { canal: saved } = canal ? await service.updateChannel(canal.id, datos) : await service.createChannel(idComunidad, datos);
      if (alive.current) onSaved(saved);
    } catch (e) {
      if (alive.current) {
        setError(e.code === 'CHANNEL_HAS_MESSAGES' ? 'Este canal tiene mensajes y debe conservar el tipo Texto.' : e.message);
        if ([403, 404].includes(e.status)) onUnavailable();
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <form className="community-form channel-form" onSubmit={submit} aria-busy={busy}>
    <h2>{canal ? 'Editar canal' : 'Crear canal'}</h2>
    {stale && <p role="alert" className="notice error">El canal pudo cambiar en otra sesión. Recargá el formulario antes de guardar.
      <button type="button" className="secondary" onClick={onReload}>Recargar formulario</button></p>}
    <fieldset disabled={busy || stale}>
      <FormField label="Nombre del canal" value={nombre} maxLength={32} required onChange={(e) => setNombre(e.target.value)} autoFocus />
      <FormField as="select" label="Tipo de canal" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        {Object.entries(CHANNEL_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </FormField>
      {!canal && <label className="channel-checkbox"><input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} /> Canal privado</label>}
      {!canal && privado && <p className="community-help">Al crearlo, solo propietarios y administradores podrán verlo. Después podés habilitar roles e integrantes en Permisos.</p>}
      {tipo !== 'TEXTO' && <p className="community-help">Las llamadas estarán disponibles en una próxima entrega.</p>}
      {canal?.tipo === 'TEXTO' && <p className="community-help">Un canal con mensajes debe conservar el tipo Texto.</p>}
      <button type="submit">{busy ? 'Guardando…' : canal ? 'Guardar canal' : 'Crear canal'}</button>
    </fieldset>
    {error && <p role="alert" className="notice error">{error}</p>}
    <button type="button" className="secondary channel-cancel" disabled={busy} onClick={onCancel}>Cancelar</button>
  </form>;
}
