import { useEffect, useRef, useState } from 'react';
import { createChannel, replaceChannelAccess, suggestChannel } from '../../services/channelsService.js';
import { getCommunityRoles } from '../../services/communityRolesService.js';
import Button from '../ui/Button.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import './createChannelWizard.css';

const PASOS = ['Texto o voz', 'Cómo lo armás', 'Detalles', 'Permisos'];
const BASE = [['PROPIETARIO', 'Propietarios', true], ['ADMIN', 'Admins', true], ['MODERADOR', 'Moderadores'], ['INTEGRANTE', 'Integrantes']];

function Pills({ title, options, value, onToggle }) {
  return (
    <div className="ccw-group">
      <span className="ccw-group-title">{title}</span>
      <div className="ccw-pills">
        {options.map(([key, label, fijo]) => (
          <button key={key} type="button" className={`ccw-pill pr ${fijo || value.includes(key) ? 'ccw-pill-on' : ''}`} aria-pressed={fijo || value.includes(key)} disabled={fijo} onClick={() => onToggle(key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function CreateChannelWizard({ idComunidad, onCreated, onCancel, onOpen }) {
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState('TEXTO');
  const [via, setVia] = useState('ia');
  const [descripcion, setDescripcion] = useState('');
  const [nombre, setNombre] = useState('');
  const [privado, setPrivado] = useState(false);
  const [ver, setVer] = useState(['MODERADOR', 'INTEGRANTE']);
  const [usar, setUsar] = useState(['MODERADOR', 'INTEGRANTE']);
  const [roles, setRoles] = useState([]);
  const [propuesta, setPropuesta] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [sinIA, setSinIA] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creado, setCreado] = useState(null);
  const [permisosFallaron, setPermisosFallaron] = useState(false);
  const alive = useRef(true);
  const enviando = useRef(false);
  const voz = tipo === 'VOZ';

  useEffect(() => {
    alive.current = true;
    getCommunityRoles(idComunidad).then(({ items }) => { if (alive.current) setRoles(items); }).catch(() => {});
    return () => { alive.current = false; };
  }, [idComunidad]);

  const opciones = [...BASE, ...roles.map((r) => [`custom:${r.id}`, r.nombre])];
  const toggle = (set) => (key) => set((old) => old.includes(key) ? old.filter((k) => k !== key) : [...old, key]);

  async function proponer() {
    setPensando(true); setSinIA(false); setError('');
    try {
      const { propuesta: p } = await suggestChannel(idComunidad, { descripcion, tipo });
      if (!alive.current) return;
      setPropuesta(p);
      setNombre(p.nombre ?? '');
      setPrivado(Boolean(p.privado));
      if (p.ver) setVer(p.ver);
      if (p.usar) setUsar(p.usar);
      setPaso(2);
    } catch {
      if (alive.current) setSinIA(true);
    } finally {
      if (alive.current) setPensando(false);
    }
  }

  function habilitaciones() {
    const permiso = voz ? ['HABLAR', 'TRANSMITIR'] : ['ESCRIBIR'];
    return [...new Set([...ver, ...usar])].filter((k) => !['PROPIETARIO', 'ADMIN'].includes(k)).map((k) => ({
      ...(k.startsWith('custom:') ? { idRol: Number(k.slice(7)) } : { rol: k }),
      permisos: usar.includes(k) ? ['VER', ...permiso] : ['VER'],
    }));
  }

  async function crear() {
    const limpio = nombre.trim();
    if (!limpio || limpio !== nombre || limpio.length > 32) { setPaso(2); setError('Usá entre 1 y 32 caracteres, sin espacios al principio ni al final.'); return; }
    if (enviando.current) return;
    enviando.current = true;
    setBusy(true); setError('');
    try {
      const { canal } = creado ? { canal: creado } : await createChannel(idComunidad, { nombre: limpio, tipo, privado });
      if (!alive.current) return;
      setCreado(canal);
      try {
        await replaceChannelAccess(canal.id, { privado, habilitaciones: habilitaciones() });
        if (alive.current) { setPermisosFallaron(false); setPaso(4); onCreated(canal); }
      } catch {
        if (alive.current) setPermisosFallaron(true);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      enviando.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function siguiente() {
    if (paso === 1 && via === 'ia') return proponer();
    if (paso === 1) { setPropuesta(null); return setPaso(2); }
    if (paso === 2) {
      const limpio = nombre.trim();
      if (!limpio || limpio !== nombre || limpio.length > 32) { setError('Usá entre 1 y 32 caracteres, sin espacios al principio ni al final.'); return undefined; }
      setError('');
    }
    if (paso === 3) return crear();
    return setPaso(paso + 1);
  }

  const etiquetaSiguiente = paso === 1 && via === 'ia' ? 'Proponer con IA' : paso === 3 ? 'Crear canal' : 'Siguiente';

  return (
    <div className="ccw">
      <nav className="ccw-side" aria-label="Pasos">
        <span className="dsp ccw-title">Nuevo canal</span>
        {PASOS.map((label, i) => (
          <button key={label} type="button" className={`ccw-step pr ${paso === i ? 'ccw-step-on' : ''}`} aria-current={paso === i ? 'step' : undefined}
            disabled={i > paso || paso === 4 || busy} onClick={() => setPaso(i)}>
            <span className={`ccw-num ${i < paso ? 'ccw-num-done' : paso === i ? 'ccw-num-on' : ''}`}>{i < paso ? '✓' : i + 1}</span>{label}
          </button>
        ))}
      </nav>
      <div className="ccw-main">
        {paso === 0 && <div className="ccw-step-body ccw-rise">
          <h2 className="dsp ccw-h">¿Qué tipo de canal?</h2>
          <div className="ccw-tiles" role="radiogroup" aria-label="Tipo de canal">
            {[['TEXTO', 'Texto', 'canalTexto'], ['VOZ', 'Voz', 'canalVoz']].map(([valor, texto, icono]) => (
              <button key={valor} type="button" role="radio" aria-checked={tipo === valor} className={`ccw-tile pr ${tipo === valor ? 'ccw-tile-on' : ''}`} onClick={() => setTipo(valor)}>
                <span className="ccw-tile-ic"><Icon name={icono} size={24} stroke={2} /></span>
                <span className="ccw-tile-t">{texto}</span>
              </button>
            ))}
          </div>
        </div>}

        {paso === 1 && <div className="ccw-step-body ccw-rise">
          <h2 className="dsp ccw-h">¿Cómo querés armarlo?</h2>
          <div className="ccw-tiles" role="radiogroup" aria-label="Cómo armarlo">
            <button type="button" role="radio" aria-checked={via === 'ia'} className={`ccw-tile pr ${via === 'ia' ? 'ccw-tile-on' : ''}`} onClick={() => setVia('ia')}>
              <span className="ccw-orb" />
              <span className="ccw-tile-t">Contáselo a la IA</span>
              <span className="li-sub">Describís para qué es y te propone nombre, privacidad y permisos.</span>
            </button>
            <button type="button" role="radio" aria-checked={via === 'mano'} className={`ccw-tile pr ${via === 'mano' ? 'ccw-tile-on' : ''}`} onClick={() => setVia('mano')}>
              <span className="ccw-tile-ic"><Icon name="lapiz" size={22} stroke={2} /></span>
              <span className="ccw-tile-t">Lo armo yo</span>
              <span className="li-sub">Completás cada campo a mano.</span>
            </button>
          </div>
          {via === 'ia' && !pensando && !sinIA && (
            <div className="ccw-aiw">
              <textarea aria-label="Contale a la IA para qué es el canal" value={descripcion} maxLength={500} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          )}
          {pensando && (
            <div className="ccw-card" role="status">
              <span className="ccw-thinking"><Spinner size={18} />Armando el canal…</span>
              <span className="sk" style={{ height: 14, width: '70%' }} /><span className="sk" style={{ height: 12, width: '92%' }} /><span className="sk" style={{ height: 12, width: '56%' }} />
            </div>
          )}
          {sinIA && (
            <div className="ccw-card">
              <span className="ccw-card-ic"><Icon name="ia" size={24} stroke={1.8} /></span>
              <span className="ccw-card-t">No encontré una buena propuesta</span>
              <span className="li-sub">Contame para qué lo van a usar, o completalo a mano.</span>
              <button type="button" className="lnk lnk-secundario" onClick={() => { setSinIA(false); setVia('mano'); setPaso(2); }}>Completar a mano</button>
            </div>
          )}
        </div>}

        {paso === 2 && <div className="ccw-step-body ccw-rise">
          <h2 className="dsp ccw-h">Detalles</h2>
          {propuesta && <span className="bdg bdg-acento ccw-badge"><Icon name="ia" size={14} stroke={2} />Completado por IA, cambiá lo que quieras</span>}
          <div className="fld">
            <label className="fl" htmlFor="ccw-nombre">Nombre</label>
            <span className={`inp ccw-name ${error ? 'inp-error' : ''}`}>
              {!voz && <span className="chf-hash">#</span>}
              <input id="ccw-nombre" value={nombre} maxLength={32} onChange={(e) => setNombre(e.target.value)} autoFocus />
              <span className="cf-count">{nombre.length} / 32</span>
            </span>
            {error && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />{error}</span>}
          </div>
          <div className="chf-priv"><span className="chf-priv-row">
            <span className="chf-priv-label" id="ccw-priv">Canal privado</span>
            <button type="button" className={`md-sw ${privado ? 'md-sw-on' : ''}`} role="switch" aria-checked={privado} aria-labelledby="ccw-priv" onClick={() => setPrivado(!privado)}><span /></button>
          </span></div>
        </div>}

        {paso === 3 && <div className="ccw-step-body ccw-rise">
          <h2 className="dsp ccw-h">¿Quién puede hacer qué?</h2>
          {propuesta?.resumen && <div className="ccw-ab"><span className="ccw-aiav"><Icon name="ia" size={16} stroke={2} /></span><div className="ccw-bb"><b>En pocas palabras:</b> {propuesta.resumen}</div></div>}
          <Pills title="Pueden ver el canal" options={opciones} value={ver} onToggle={toggle(setVer)} />
          <Pills title={voz ? 'Pueden hablar y transmitir' : 'Pueden escribir'} options={opciones} value={usar} onToggle={toggle(setUsar)} />
          {error && <Notice tone="error" title={error} />}
          {permisosFallaron && <Notice tone="error" title="El canal se creó, pero no se pudieron guardar los permisos" actionLabel="Reintentar" onAction={crear}>Podés reintentar o ajustarlos después desde Permisos.</Notice>}
        </div>}

        {paso === 4 && creado && <div className="ccw-step-body ccw-done ccw-rise">
          <span className="ccw-orb ccw-orb-lg"><Icon name="check" size={40} stroke={2.6} /></span>
          <h2 className="dsp ccw-done-t">Listo, #{creado.nombre} ya existe</h2>
          <span className="li-sub ccw-done-s">Ya lo ven las personas que elegiste.</span>
          <Button onClick={() => onOpen(creado)}>Ir al canal</Button>
        </div>}

        {paso < 4 && <div className="ccw-foot">
          <Button variant="secundario" disabled={busy} onClick={onCancel}>Cancelar</Button>
          <span className="chf-spacer" />
          {paso > 0 && <Button variant="secundario" disabled={busy || pensando} onClick={() => { setError(''); setPaso(paso - 1); }}>Atrás</Button>}
          <Button loading={busy || pensando} disabled={paso === 1 && via === 'ia' && !descripcion.trim()} onClick={siguiente}>{etiquetaSiguiente}</Button>
        </div>}
      </div>
    </div>
  );
}
