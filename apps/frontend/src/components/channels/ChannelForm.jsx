import {useUnsavedChanges} from '../../context/UnsavedChangesContext.jsx';
import { useEffect, useRef, useState } from 'react';
import * as service from '../../services/channelsService.js';
import PermissionPills from './PermissionPills.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import './channelForm.css';

export const CHANNEL_TYPES = { TEXTO: 'Texto', VOZ: 'Voz', VIDEO: 'Voz' };
const TIPOS_ELEGIBLES = [['TEXTO', 'Texto', 'canalTexto'], ['VOZ', 'Voz', 'canalVoz']];

export default function ChannelForm({ idComunidad, canal, version, onSaved, onCancel, onReload, onUnavailable, onEditAccess, onDelete }) {
  const [nombre, setNombre] = useState(canal?.nombre ?? '');
  const [tipo, setTipo] = useState('TEXTO');
  const [global,setGlobal] = useState(['ESCRIBIR']);
  const [privado, setPrivado] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const initialVersion = useRef(version), pending = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (canal && initialVersion.current !== version && !pending.current) setStale(true); }, [canal, version, busy]);
  const {guard,markSaved}=useUnsavedChanges(canal?nombre!==canal.nombre:Boolean(nombre),'Canal',JSON.stringify([nombre,tipo,global,privado]));
  const esTexto = (canal?.tipo ?? tipo) === 'TEXTO';

  async function submit(event) {
    event.preventDefault();
    if (pending.current || stale) return;
    if (!nombre.trim() || nombre !== nombre.trim() || nombre.length > 32) {
      setError('Usá entre 1 y 32 caracteres, sin espacios al principio ni al final.'); return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const datos = canal ? { nombre } : { nombre, tipo, privado, permisosGlobales:privado?[]:global };
      const { canal: saved } = canal ? await service.updateChannel(canal.id, datos) : await service.createChannel(idComunidad, datos);
      if (alive.current) {markSaved();onSaved(saved);}
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        if ([403, 404].includes(e.status)) onUnavailable();
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }

  return (
    <form className="chf" onSubmit={submit} aria-busy={busy} noValidate>
      <div className="chf-head">
        <h2 className="dsp">{canal ? 'Editar canal' : 'Crear canal'}</h2>
        <button type="button" className="chf-close pr" aria-label="Cerrar" disabled={busy} onClick={()=>guard(onCancel)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {stale && <Notice tone="conflicto" role="alert" title="El canal pudo cambiar en otra sesión" actionLabel="Recargar formulario" onAction={()=>guard(onReload)}>Recargá para ver la última versión antes de guardar.</Notice>}
      <fieldset className="chf-fields" disabled={busy || stale}>
        {!canal && (
          <div className="chf-types" role="radiogroup" aria-label="Tipo de canal">
            {TIPOS_ELEGIBLES.map(([valor, texto, icono]) => (
              <label key={valor} className={`cf-opt pr ${tipo === valor ? 'cf-opt-on' : ''}`}>
                <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => {setTipo(valor);setGlobal(valor==='TEXTO'?['ESCRIBIR']:['HABLAR']);}} />
                <span className="cf-oi"><Icon name={icono} size={19} stroke={2} /></span>
                <span className="cf-ot">{texto}</span>
                <span className="cf-ck"><Icon name="check" size={13} stroke={3} /></span>
              </label>
            ))}
          </div>
        )}
        <div className="fld">
          <label className="fl" htmlFor="chf-nombre">Nombre del canal</label>
          <span className={`inp ${error ? 'inp-error' : ''}`}>
            {esTexto && <span className="chf-hash">#</span>}
            <input id="chf-nombre" value={nombre} maxLength={32} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </span>
          {error && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />{error}</span>}
        </div>
        {canal && (
          <div className="chf-type-row">
            <Icon name={esTexto ? 'canalTexto' : 'canalVoz'} size={17} stroke={2} />
            <span>{esTexto ? 'Canal de texto' : 'Canal de voz'}</span>
          </div>
        )}
        {!canal ? (
          <div className="chf-priv">
            <span className="chf-priv-row">
              <span className="chf-priv-label" id="chf-priv">Canal privado</span>
              <button type="button" className={`md-sw ${privado ? 'md-sw-on' : ''}`} role="switch" aria-checked={privado} aria-labelledby="chf-priv" onClick={() => setPrivado(!privado)}><span /></button>
            </span>
          </div>
        ) : onEditAccess && (
          <div className="chf-priv">
            <button type="button" className="lnk lnk-primario chf-access" onClick={onEditAccess}>
              Editar permisos<span className="chf-arrow"><Icon name="chevron" size={14} stroke={2.2} /></span>
            </button>
          </div>
        )}
        {!canal&&!privado&&<PermissionPills tipo={tipo} value={global} onChange={setGlobal}/>}
      </fieldset>
      <div className="chf-actions">
        {onDelete && <button type="button" className="chf-delete pr" disabled={busy} onClick={(e) => onDelete(e.currentTarget)}><Icon name="papelera" size={16} stroke={2} />Eliminar canal</button>}
        <span className="chf-spacer" />
        <Button variant="secundario" disabled={busy} onClick={()=>guard(onCancel)}>Cancelar</Button>
        <Button type="submit" loading={busy} disabled={stale}>{busy ? 'Guardando…' : canal ? 'Guardar canal' : 'Crear canal'}</Button>
      </div>
    </form>
  );
}
