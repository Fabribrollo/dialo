import { useRef, useState } from 'react';
import { useProfile } from '../hooks/useProfile.js';
import { useSubmit } from '../hooks/useSubmit.js';
import Avatar from './ui/Avatar.jsx';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import Field from './ui/Field.jsx';
import Icon from './ui/Icon.jsx';
import Notice from './ui/Notice.jsx';
import Menu, { MenuItem } from './ui/Menu.jsx';
import './profileForm.css';

const estados = [['EN_LINEA', 'En línea'], ['AUSENTE', 'Ausente'], ['NO_MOLESTAR', 'No molestar'], ['INVISIBLE', 'Invisible']];

function fotoError(error) {
  if (!error) return null;
  if (error.code === 'IMAGE_BLOCKED') return 'bloqueada';
  if (error.code === 'RATE_LIMITED') return 'limite';
  return 'invalida';
}

export default function ProfileForm() {
  const { usuario, updateProfile, updateAvatar, removeAvatar } = useProfile();
  const datos = useSubmit(updateProfile);
  const foto = useSubmit(updateAvatar);
  const quitar = useSubmit(removeAvatar);
  const [colorAvatar, setColorAvatar] = useState(usuario.colorAvatar || '#756222');
  const archivo = useRef(null);
  const [nombre, setNombre] = useState(usuario.nombreVisible);
  const [info, setInfo] = useState(usuario.informacionPersonal ?? '');
  const [estado, setEstado] = useState(usuario.disponibilidad);
  const [guardado, setGuardado] = useState(false);
  const [menuEstado, setMenuEstado] = useState(false);
  const [errores, setErrores] = useState({});
  const problemaFoto = fotoError(foto.error);

  async function onSubmit(event) {
    event.preventDefault();
    setGuardado(false);
    const e = { nombreVisible: nombre.trim().length >= 2 && nombre.trim().length <= 40 ? '' : 'Tiene que tener entre 2 y 40 caracteres.' };
    setErrores(e);
    if (e.nombreVisible) return;
    const ok = await datos.submit({ nombreVisible: nombre, informacionPersonal: info.trim() || null, disponibilidad: estado, colorAvatar });
    setGuardado(ok);
  }

  function onFoto(event) {
    const elegido = event.target.files[0];
    if (elegido) foto.submit(elegido);
    event.target.value = '';
  }

  return (
    <form className="pf" onSubmit={onSubmit} noValidate>
      <div className="pf-side">
        <Card className="pf-id">
          <Avatar nombre={usuario.nombreVisible} foto={usuario.fotoUrl} color={colorAvatar} size={132} presence={estado} dark className="pf-av" />
          <span className="pf-names">
            <span className="dsp pf-name">{usuario.nombreVisible}</span>
            <span className="pf-user">@{usuario.nombreUsuario}</span>
          </span>
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFoto} />
          <Button size="sm" loading={foto.enviando} onClick={() => archivo.current.click()}>
            {!foto.enviando && <Icon name="subir" size={15} stroke={2.2} />}
            {foto.enviando ? 'Subiendo foto…' : 'Cambiar foto'}
          </Button>
          {usuario.fotoUrl && <Button size="sm" variant="secundario" loading={quitar.enviando} onClick={() => quitar.submit()}>Quitar foto</Button>}
          {quitar.error && <Notice tone="error" title={quitar.error.message} />}
          <Field as="select" label="Color del avatar" value={colorAvatar} onChange={(e) => setColorAvatar(e.target.value)}>
            {[['#756222','Oliva'],['#6A3CF5','Violeta'],['#156B64','Verde'],['#A63D40','Rojo'],['#305C91','Azul'],['#765174','Malva']].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </Field>
          {problemaFoto === 'invalida'  && <span className="fld-error" role="alert"><Icon name="error" size={15} stroke={2} />Elegí una imagen JPG, PNG o WebP de hasta 2 MB.</span>}
          {problemaFoto === 'limite' && <Notice tone="espera" title="Estás subiendo imágenes muy rápido">Esperá un momento y probá de nuevo.</Notice>}
        </Card>

        <div className="pf-status-m">
          <span className="fl">Estado</span>
          <button type="button" className="lg pr pf-status-btn" aria-haspopup="menu" aria-expanded={menuEstado} onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenuEstado((v) => !v)}>
            <span className={`pf-dot pres-${estado}`} /><span className="pf-status-name">{estados.find(([v]) => v === estado)?.[1]}</span><Icon name="chevron" size={16} stroke={2} />
          </button>
          <Menu open={menuEstado} onClose={() => setMenuEstado(false)} label="Estado" className="pf-menu">
            {estados.map(([valor, texto]) => (
              <MenuItem key={valor} selected={estado === valor} onClick={() => { setEstado(valor); setMenuEstado(false); }}>
                <span className={`pf-dot pres-${valor}`} />{texto}
              </MenuItem>
            ))}
          </Menu>
        </div>

        <Card className="pf-status" role="radiogroup" aria-label="Estado">
          <span className="fl pf-status-label">Estado</span>
          {estados.map(([valor, texto]) => (
            <button key={valor} type="button" role="radio" aria-checked={estado === valor} className={`pr pf-st ${estado === valor ? 'pf-st-on' : ''}`} onClick={() => setEstado(valor)}>
              <span className={`pf-dot pres-${valor}`} />{texto}
            </button>
          ))}
        </Card>
      </div>

      <Card className="pf-main">
        {datos.error && !datos.error.details?.length && <Notice tone="error" title="No pudimos guardar los cambios">Revisá tu conexión y probá de nuevo.</Notice>}
        <Field label="Nombre visible" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} error={errores.nombreVisible || datos.errorDe('nombreVisible')} />
        <Field label="Usuario" value={`@${usuario.nombreUsuario}`} disabled readOnly />
        <Field as="textarea" label="Información personal" value={info} maxLength={190} onChange={(e) => setInfo(e.target.value)} error={datos.errorDe('informacionPersonal')} />
        <div className="pf-actions">
          {guardado && <span className="pf-saved" role="status"><Icon name="check" size={17} stroke={2.6} />Cambios guardados</span>}
          <Button type="submit" loading={datos.enviando}>{datos.enviando ? 'Guardando…' : 'Guardar cambios'}</Button>
        </div>
        {problemaFoto === 'bloqueada' && (
          <>
            <div className="pf-sep" />
            <div className="pf-blocked" role="alert">
              <span className="pf-blocked-ic"><Icon name="moderacion" size={24} stroke={1.8} /></span>
              <span className="pf-blocked-text"><b>La imagen no cumple las normas</b><span>No se subió</span></span>
            </div>
          </>
        )}
      </Card>
    </form>
  );
}
