import {useUnsavedChanges} from '../context/UnsavedChangesContext.jsx';
import { useRef, useState } from 'react';
import { avisar } from './shell/systemToastsStore.js';
import { useProfile } from '../hooks/useProfile.js';
import { useSubmit } from '../hooks/useSubmit.js';
import Avatar from './ui/Avatar.jsx';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';
import Icon from './ui/Icon.jsx';
import Notice from './ui/Notice.jsx';
import './profileForm.css';

const estados = [['EN_LINEA', 'En línea', 'Te ven disponible.'], ['AUSENTE', 'Ausente', 'Respondés más tarde.'], ['NO_MOLESTAR', 'No molestar', 'Sin avisos ni tonos.'], ['INVISIBLE', 'Invisible', 'Aparecés desconectado.']];
export const COLORES_AVATAR = [['#756222', 'Oliva'], ['#6A3CF5', 'Violeta'], ['#156B64', 'Verde'], ['#A63D40', 'Rojo'], ['#305C91', 'Azul'], ['#765174', 'Malva']];

function fotoError(error) {
  if (!error) return null;
  if (error.code === 'IMAGE_BLOCKED') return 'bloqueada';
  if (error.code === 'RATE_LIMITED') return 'limite';
  return 'invalida';
}

// Un solo formulario: identidad arriba, datos y estado en tarjetas del mismo estilo; `aside` suma ajustes debajo del estado.
export default function ProfileForm({ aside = null }) {
  const { usuario, updateProfile, updateAvatar, removeAvatar,updateCover,removeCover } = useProfile();
  const cover=useSubmit(updateCover),clearCover=useSubmit(removeCover),coverInput=useRef(null);
  const [title,setTitle]=useState(usuario.tituloPerfil??''),[pronouns,setPronouns]=useState(usuario.pronombres??'');
  const datos = useSubmit(updateProfile);
  const foto = useSubmit(updateAvatar);
  const quitar = useSubmit(removeAvatar);
  const [colorAvatar, setColorAvatar] = useState(usuario.colorAvatar || '#756222');
  const archivo = useRef(null);
  const [nombre, setNombre] = useState(usuario.nombreVisible);
  const [info, setInfo] = useState(usuario.informacionPersonal ?? '');
  const [estado, setEstado] = useState(usuario.disponibilidad);
  const [errores, setErrores] = useState({});
  const {markSaved}=useUnsavedChanges(nombre!==usuario.nombreVisible||info!==(usuario.informacionPersonal??'')||estado!==usuario.disponibilidad||colorAvatar!==(usuario.colorAvatar||'#756222')||title!==(usuario.tituloPerfil??'')||pronouns!==(usuario.pronombres??''),'Perfil',JSON.stringify([nombre,info,estado,colorAvatar,title,pronouns]));
  const problemaFoto = fotoError(foto.error);

  async function onSubmit(event) {
    event.preventDefault();
    const e = { nombreVisible: nombre.trim().length >= 2 && nombre.trim().length <= 40 ? '' : 'Tiene que tener entre 2 y 40 caracteres.' };
    setErrores(e);
    if (e.nombreVisible) return;
    const ok = await datos.submit({ nombreVisible: nombre, informacionPersonal: info.trim() || null, disponibilidad: estado, colorAvatar,tituloPerfil:title.trim()||null,pronombres:pronouns.trim()||null });
    if (ok) { markSaved(); avisar({ id: 'perfil', texto: 'Cambios guardados', anunciar: false }); }
  }

  function onFoto(event) {
    const elegido = event.target.files[0];
    if (elegido) foto.submit(elegido);
    event.target.value = '';
  }

  // Flechas para moverse entre opciones de un grupo de radios, como en uno nativo.
  function moverRadio(event, lista, actual, elegir) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const i = (lista.indexOf(actual) + keys[event.key] + lista.length) % lista.length;
    elegir(lista[i]);
    event.currentTarget.parentElement.querySelectorAll('[role=radio]')[i]?.focus();
  }

  return (
    <form className="pf" onSubmit={onSubmit} noValidate>
      <section className="set-card pf-hero" aria-label="Identidad">
        <div className="pf-cover">
          {usuario.portadaUrl ? <img src={usuario.portadaUrl} alt="Portada del perfil" /> : <span className="pf-cover-empty" aria-hidden="true" />}
          <div className="pf-cover-actions">
            <Button size="sm" variant="secundario" loading={cover.enviando} onClick={() => coverInput.current.click()}>{usuario.portadaUrl ? 'Cambiar portada' : 'Agregar portada'}</Button>
            {usuario.portadaUrl && <Button size="sm" variant="secundario" loading={clearCover.enviando} onClick={() => clearCover.submit()}>Quitar portada</Button>}
          </div>
        </div>
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Seleccionar foto de portada" onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)cover.submit(file);}}/>
        <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFoto} />
        <div className="pf-identity">
          <Avatar nombre={usuario.nombreVisible} foto={usuario.fotoUrl} color={colorAvatar} size={112} presence={estado} className="pf-av" />
          <div className="pf-names">
            <h2 className="dsp pf-name">{nombre.trim() || usuario.nombreVisible}</h2>
            <span className="pf-user">@{usuario.nombreUsuario}{pronouns.trim() ? ` · ${pronouns.trim()}` : ''}</span>
          </div>
          <div className="pf-photo-actions">
            <Button size="sm" loading={foto.enviando} onClick={() => archivo.current.click()}>
              {!foto.enviando && <Icon name="subir" size={15} stroke={2.2} />}
              {foto.enviando ? 'Subiendo foto…' : 'Cambiar foto'}
            </Button>
            {usuario.fotoUrl && <Button size="sm" variant="secundario" loading={quitar.enviando} onClick={() => quitar.submit()}>Quitar foto</Button>}
          </div>
        </div>
        {(cover.error || clearCover.error || quitar.error || problemaFoto) && <div className="pf-hero-notes">
          {cover.error && <Notice tone="error" title={cover.error.message} />}
          {clearCover.error && <Notice tone="error" title={clearCover.error.message} />}
          {quitar.error && <Notice tone="error" title={quitar.error.message} />}
          {problemaFoto === 'invalida' && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />Elegí una imagen JPG, PNG o WebP de hasta 2 MB.</span>}
          {problemaFoto === 'limite' && <Notice tone="espera" title="Estás subiendo imágenes muy rápido">Esperá un momento y probá de nuevo.</Notice>}
          {problemaFoto === 'bloqueada' && <div className="pf-blocked" role="alert">
            <span className="pf-blocked-ic"><Icon name="moderacion" size={22} stroke={1.8} /></span>
            <span className="pf-blocked-text"><b>La imagen no cumple las normas</b><span>No se subió</span></span>
          </div>}
        </div>}
      </section>

      <div className="pf-grid">
        <section className="set-card pf-info" aria-labelledby="pf-info-titulo">
          <header className="set-head"><h2 id="pf-info-titulo">Información</h2><p>Lo que ven tus amigos y comunidades.</p></header>
          {datos.error && !datos.error.details?.length && <Notice tone="error" title="No pudimos guardar los cambios">Revisá tu conexión y probá de nuevo.</Notice>}
          <div className="pf-fields">
            <Field label="Nombre visible" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} error={errores.nombreVisible || datos.errorDe('nombreVisible')} />
            <Field label="Pronombres" value={pronouns} maxLength={30} onChange={e=>setPronouns(e.target.value)} error={datos.errorDe('pronombres')}/>
            <Field className="pf-wide" label="Presentación" value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} error={datos.errorDe('tituloPerfil')}/>
            <Field className="pf-wide" as="textarea" label="Información personal" value={info} maxLength={190} onChange={(e) => setInfo(e.target.value)} error={datos.errorDe('informacionPersonal')} />
            <Field className="pf-wide" label="Usuario" value={`@${usuario.nombreUsuario}`} disabled readOnly />
          </div>
          <div className="pf-colors">
            <span className="fl" id="pf-color-titulo">Color del avatar</span>
            <div className="pf-swatches" role="radiogroup" aria-labelledby="pf-color-titulo">
              {COLORES_AVATAR.map(([valor, texto]) => (
                <button key={valor} type="button" role="radio" aria-checked={colorAvatar === valor} aria-label={texto} title={texto}
                  tabIndex={colorAvatar === valor ? 0 : -1} className="pf-swatch" style={{ '--sw': valor }}
                  onClick={() => setColorAvatar(valor)}
                  onKeyDown={(e) => moverRadio(e, COLORES_AVATAR.map(([v]) => v), colorAvatar, setColorAvatar)}>
                  {colorAvatar === valor && <Icon name="check" size={16} stroke={2.6} />}
                </button>
              ))}
            </div>
            <small className="pf-color-hint">Se usa cuando no tenés foto.</small>
          </div>
          <div className="pf-actions">
            <Button type="submit" loading={datos.enviando}>{datos.enviando ? 'Guardando…' : 'Guardar cambios'}</Button>
          </div>
        </section>

        <div className="pf-aside">
          <section className="set-card pf-status" aria-labelledby="pf-estado-titulo">
            <header className="set-head"><h2 id="pf-estado-titulo">Estado</h2><p>Se guarda con el resto del perfil.</p></header>
            <div className="pf-status-list" role="radiogroup" aria-labelledby="pf-estado-titulo">
              {estados.map(([valor, texto, ayuda]) => (
                <button key={valor} type="button" role="radio" aria-checked={estado === valor} tabIndex={estado === valor ? 0 : -1}
                  aria-label={texto} aria-describedby={`pf-st-${valor}`} className="pf-st" onClick={() => setEstado(valor)}
                  onKeyDown={(e) => moverRadio(e, estados.map(([v]) => v), estado, setEstado)}>
                  <span className={`pf-dot pres-${valor}`} aria-hidden="true" />
                  <span className="pf-st-text" aria-hidden="true"><b>{texto}</b><small id={`pf-st-${valor}`}>{ayuda}</small></span>
                </button>
              ))}
            </div>
          </section>
          {aside}
        </div>
      </div>
    </form>
  );
}
