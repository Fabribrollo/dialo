import {useUnsavedChanges} from '../../context/UnsavedChangesContext.jsx';
import { hasCommunityPermission } from '../../utils/permissionCatalog.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import '../ui/badge.css';
import { useCommunities } from '../../context/CommunitiesContext.jsx';
import * as service from '../../services/communitiesService.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import { COMMUNITY_ROLES } from '../../pages/CommunitiesPage.jsx';
import './communityForm.css';
import CommunityDraftBuilder from './CommunityDraftBuilder.jsx';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function draftFieldLabel(path = '') {
  const item = /^borrador\.(canales|roles)\.(\d+)/.exec(path);
  if (item) return `${item[1] === 'canales' ? 'Canal' : 'Rol'} ${Number(item[2]) + 1}`;
  if (path.includes('canales')) return 'Canales';
  if (path.includes('roles')) return 'Roles';
  return 'Comunidad';
}

function iniciales(nombre) {
  const t = nombre.trim();
  if (!t) return '';
  const palabras = t.split(/\s+/);
  return palabras.filter((w) => w.length > 2 || palabras.length === 1).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function Tile({ nombre, url, size }) {
  const fondo = url ? undefined : nombre.trim() ? 'light-dark(#131316, #4a4458)' : 'light-dark(#E2E3E8, #34303f)';
  return (
    <span className={`cf-tile cf-tile-${size}`} style={{ background: fondo }}>
      {url ? <img src={url} alt="" /> : iniciales(nombre)}
    </span>
  );
}

export default function CommunityForm({ comunidad }) {
  const navigate = useNavigate();
  const { remember, removed } = useCommunities();
  const [nombre, setNombre] = useState(comunidad?.nombre ?? '');
  const [tipo, setTipo] = useState(comunidad?.tipo ?? 'PRIVADA');
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState('');
  const [imageError, setImageError] = useState('');
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false), [draft, setDraft] = useState(null), [purpose, setPurpose] = useState('');
  const [generating, setGenerating] = useState(false), [uncertain, setUncertain] = useState(false);
  const confirmation = useRef(null);
  const manualDraft = useRef(null), aiIdentity = useRef(null);
  function chooseMode(next) {
    if (next === ai) return;
    if (next) {
      manualDraft.current = { nombre, tipo };
      if (aiIdentity.current) { setNombre(aiIdentity.current.nombre); setTipo(aiIdentity.current.tipo); }
    } else {
      aiIdentity.current = { nombre, tipo };
      if (manualDraft.current) { setNombre(manualDraft.current.nombre); setTipo(manualDraft.current.tipo); }
    }
    setError(null); setAi(next);
  }
  const {guard,markSaved}=useUnsavedChanges(nombre!==(comunidad?.nombre??'')||tipo!==(comunidad?.tipo??'PRIVADA')||Boolean(imagen)||Boolean(draft)||Boolean(purpose),'Comunidad',JSON.stringify([nombre,tipo,imagen?.name,draft,purpose]));
  const [created, setCreated] = useState(null);
  const inFlight = useRef(false);
  const saved = useRef(comunidad ?? null);
  const fileInput = useRef(null);
  const alive = useRef(true);
  const editing = Boolean(comunidad);
  const canManage = !comunidad || hasCommunityPermission(comunidad,'EDITAR_COMUNIDAD');
  const clean = nombre.trim();
  const nombreOk = clean.length >= 2 && clean.length <= 64;
  const currentImage = preview || comunidad?.imagenUrl || saved.current?.imagenUrl;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!imagen) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(imagen);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imagen]);

  function clearImage() {
    setImagen(null);
    setImageError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  function selectImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > 2 * 1024 * 1024) {
      setImageError('Elegí una imagen JPG, PNG o WebP de hasta 2 MB.');
      event.target.value = '';
      return;
    }
    setImagen(file);
    setImageError('');
    setBlocked(false);
  }

  function done(target) {
    if (alive.current) {markSaved();navigate(`/comunidades/${target.id}`, { replace: true, state: { notice: editing || created ? 'Cambios guardados.' : 'Comunidad creada.' } });}
  }

  async function submit(event) {
    event?.preventDefault();
    if (inFlight.current || !canManage || generating) return;
    setTouched(true);
    if (!nombreOk) return;
    if (ai && !saved.current && !draft) { setError({ message: 'Generá una propuesta o elegí Crear a mano.' }); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let metadataSaved = false;
    try {
      const datos = { nombre: clean, tipo };
      let response;
      if (saved.current) response = await service.updateCommunity(saved.current.id, datos);
      else if (ai) {
        // Se conserva exactamente el mismo envío si se pierde la respuesta del servidor.
        confirmation.current ??= { clave: crypto.randomUUID(), borrador: { ...datos, canales: draft.canales, roles: draft.roles } };
        response = await service.confirmCommunityDraft(confirmation.current);
        setUncertain(false);
      } else response = await service.createCommunity(datos);
      saved.current = response.comunidad;
      metadataSaved = true;
      remember(response.comunidad);
      if (!comunidad && alive.current) setCreated(response.comunidad);
      if (imagen) {
        const uploaded = await service.uploadCommunityImage(response.comunidad.id, imagen);
        saved.current = uploaded.comunidad;
        remember(uploaded.comunidad);
      }
      done(saved.current);
    } catch (e) {
      if (!alive.current) return;
      if (ai && !metadataSaved) {
        if (e.status >= 400 && e.status < 500 && !['CREATION_KEY_CONFLICT', 'CREATION_UNAVAILABLE'].includes(e.code)) confirmation.current = null;
        else setUncertain(true);
      }
      if (metadataSaved && e.code === 'IMAGE_BLOCKED') {
        clearImage();
        setBlocked(true);
      } else {
        setError({
          message: metadataSaved ? `Los datos de la comunidad se guardaron, pero no se pudo subir la imagen. ${e.message}` : e.message,
          details: e.details,
        });
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  if (created && removed.has(created.id)) return <Notice tone="error" title="La comunidad ya no está disponible." actionLabel="Volver a comunidades" onAction={() => navigate('/comunidades')} />;
  if (!canManage) return <Notice tone="error" title="No tenés permiso para editar esta comunidad." actionLabel="Volver a la comunidad" onAction={() => navigate(`/comunidades/${comunidad.id}`)} />;

  const nameError = touched && !nombreOk ? 'Usá entre 2 y 64 caracteres' : error?.details?.find((d) => d.campo === 'nombre')?.message;
  const subLabel = busy ? (editing || created ? 'Guardando…' : 'Creando…') : editing ? 'Guardar cambios' : created ? 'Guardar cambios' : 'Crear comunidad';
  const uploadLabel = imagen || currentImage ? 'Cambiar imagen' : 'Subir imagen';
  const cancelPath = saved.current ? `/comunidades/${saved.current.id}` : '/comunidades';

  return (
    <div className="cf-grid">
      <div>
        {blocked ? (
          <Card className="cf-panel cf-in">
            <span className="cf-panel-head">
              <h2 className="dsp">{editing ? 'Guardamos los cambios' : 'Tu comunidad ya está creada'}</h2>
              <span className="cf-panel-sub">Solo la imagen no pasó la revisión.</span>
            </span>
            <div className="cf-summary">
              <div className="cf-sum-row">
                <span className="cf-sum-ok"><Icon name="check" size={22} stroke={2.4} /></span>
                <span className="cf-sum-text"><b>Nombre y privacidad</b><span>Guardados</span></span>
              </div>
              <div className="cf-sum-sep" />
              <div className="cf-sum-row">
                <span className="cf-sum-blk"><Icon name="moderacion" size={24} stroke={1.8} /></span>
                <span className="cf-sum-text"><b>Imagen</b><span>No cumple las normas de la comunidad, así que no se guardó. {editing ? 'Sigue la imagen anterior.' : ''}</span></span>
              </div>
            </div>
            <div className="cf-actions-row">
              <Button onClick={() => fileInput.current.click()}><Icon name="subir" size={15} stroke={2.2} />Elegir otra imagen</Button>
              <Button variant="secundario" onClick={() => done(saved.current)}>{editing ? 'Dejar la anterior' : 'Seguir sin imagen'}</Button>
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Elegir otra imagen" onChange={selectImage} />
          </Card>
        ) : (
          <Card as="form" className="cf-form cf-in" onSubmit={submit} aria-busy={busy} noValidate>
            {error && <div className="cf-notice"><Notice tone="error" title={error.message} />{error.details?.length > 0 && <ul>{error.details.map((d, i) => <li key={i}>{draftFieldLabel(d.campo)}: {d.message}</li>)}</ul>}</div>}
            {uncertain && <div className="cf-notice"><Notice title="No pudimos confirmar el resultado. Reintentá el mismo envío para recuperar la comunidad sin duplicarla." /></div>}
            {!editing && !created && <>
              <div className="cd-mode" role="group" aria-label="Cómo crear la comunidad">
                <Button variant={ai ? 'secundario' : 'primario'} aria-pressed={!ai} disabled={busy || uncertain} onClick={() => chooseMode(false)}>Crear a mano</Button>
                <Button variant={ai ? 'primario' : 'secundario'} aria-pressed={ai} disabled={busy || uncertain} onClick={() => chooseMode(true)}>Ayudarme con IA</Button>
              </div>
              {ai && <CommunityDraftBuilder value={draft} onChange={setDraft} purpose={purpose} onPurpose={setPurpose} onBusy={setGenerating} disabled={busy || uncertain} onGenerated={proposal => { setDraft(proposal); setNombre(proposal.nombre); setTipo(proposal.tipo); setError(null); }} />}
            </>}
            <fieldset className="cd-main-fields" disabled={busy || generating || uncertain}>
            <div className="cf-sec">
              <span className="cf-hd"><span className="cf-n">1</span><span className="cf-t">Nombre</span></span>
              <div className="cf-body">
                <label className={`inp cf-name ${nameError ? 'inp-error' : ''}`}>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={64} placeholder="Ej. Taller de Redes" aria-label="Nombre de la comunidad" aria-invalid={Boolean(nameError)} autoFocus disabled={busy} />
                  <span className="cf-count">{clean.length} / 64</span>
                </label>
                {nameError && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />{nameError}</span>}
              </div>
            </div>
            <div className="cf-sec">
              <span className="cf-hd"><span className="cf-n">2</span><span className="cf-t" id="cf-priv">Privacidad</span></span>
              <div className="cf-body cf-opts" role="radiogroup" aria-labelledby="cf-priv">
                {[['PUBLICA', 'Pública', 'publica'], ['PRIVADA', 'Privada', 'privado']].map(([valor, texto, icono]) => (
                  <label key={valor} className={`cf-opt pr ${tipo === valor ? 'cf-opt-on' : ''}`}>
                    <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} disabled={busy} />
                    <span className="cf-oi"><Icon name={icono} size={19} stroke={2} /></span>
                    <span className="cf-ot">{texto}</span>
                    <span className="cf-ck"><Icon name="check" size={13} stroke={3} /></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="cf-sec">
              <span className="cf-hd"><span className="cf-n">3</span><span className="cf-t">Imagen</span></span>
              <div className="cf-body cf-img">
                <span className="cf-tile-wrap">
                  <Tile nombre={nombre} url={currentImage} size="84" />
                  {busy && imagen && <span className="cf-uploading"><Spinner size={20} /></span>}
                </span>
                <div className="cf-img-btns">
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={uploadLabel} onChange={selectImage} />
                  <Button variant="secundario" disabled={busy} onClick={() => fileInput.current.click()}><Icon name="subir" size={15} stroke={2.2} />{uploadLabel}</Button>
                  {(imagen || imageError) && <button type="button" className="li-quiet cf-quit" onClick={clearImage}>Quitar</button>}
                </div>
              </div>
              {imageError && <span className="fld-error cf-body" role="alert"><Icon name="error" size={15} stroke={2} />{imageError}</span>}
            </div>
            </fieldset>
            <div className="cf-foot">
              {!busy && <Button variant="secundario" onClick={() => guard(()=>navigate(cancelPath))}>Cancelar</Button>}
              <Button type="submit" className="cf-submit" loading={busy} disabled={busy || generating || Boolean(imageError) || !nombreOk && touched}>{ai && !created ? uncertain ? 'Reintentar creación' : 'Confirmar y crear comunidad' : subLabel}</Button>
            </div>
          </Card>
        )}
      </div>

      <section className="cf-preview" aria-label="Vista previa">
        <span className="cf-preview-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
          Vista previa
        </span>
        <Card className="cf-preview-card">
          <Tile nombre={nombre} url={currentImage} size="80" />
          <span className="cf-preview-text">
            <span className={`dsp cf-preview-name ${clean ? '' : 'cf-placeholder'}`}>{clean || 'Nombre de la comunidad'}</span>
            <span className="cf-badges">
              <span className="bdg bdg-base">{tipo === 'PUBLICA' && <Icon name="publica" size={13} stroke={2} />}{tipo === 'PUBLICA' ? 'Pública' : 'Privada'}</span>
              <span className="bdg bdg-base">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18h16M5 15l-1-8 4.5 3.5L12 5l3.5 5.5L20 7l-1 8z" /></svg>
                Tu rol: {COMMUNITY_ROLES[comunidad?.miRol ?? 'PROPIETARIO']}
              </span>
            </span>
          </span>
        </Card>
      </section>
    </div>
  );
}
