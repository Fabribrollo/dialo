import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import FormField from '../FormField.jsx';
import CommunityImage from './CommunityImage.jsx';
import { useCommunities } from '../../context/CommunitiesContext.jsx';
import * as service from '../../services/communitiesService.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function CommunityForm({ comunidad }) {
  const navigate = useNavigate();
  const { remember, removed } = useCommunities();
  const [nombre, setNombre] = useState(comunidad?.nombre ?? '');
  const [tipo, setTipo] = useState(comunidad?.tipo ?? 'PRIVADA');
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState('');
  const [imageError, setImageError] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const inFlight = useRef(false);
  const saved = useRef(comunidad ?? null);
  const fileInput = useRef(null);
  const alive = useRef(true);
  const canManage = !comunidad || ['ADMIN', 'PROPIETARIO'].includes(comunidad.miRol);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!imagen) { setPreview(''); return; }
    const url = URL.createObjectURL(imagen);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imagen]);

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
  }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !canManage) return;
    const clean = nombre.trim();
    if (clean.length < 2 || clean.length > 64) {
      setError({ message: 'El nombre debe tener entre 2 y 64 caracteres.' });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let metadataSaved = false;
    try {
      const datos = { nombre: clean, tipo };
      const response = saved.current
        ? await service.updateCommunity(saved.current.id, datos)
        : await service.createCommunity(datos);
      saved.current = response.comunidad;
      metadataSaved = true;
      remember(response.comunidad);
      if (!comunidad && alive.current) setCreated(response.comunidad);
      // Si falla la imagen, saved conserva el ID: reintentar no crea otra comunidad.
      if (imagen) {
        const uploaded = await service.uploadCommunityImage(response.comunidad.id, imagen);
        saved.current = uploaded.comunidad;
        remember(uploaded.comunidad);
      }
      if (alive.current) navigate(`/comunidades/${saved.current.id}`, {
        replace: true,
        state: { notice: comunidad || created ? 'Cambios guardados.' : 'Comunidad creada.' },
      });
    } catch (e) {
      if (alive.current) setError({
        message: metadataSaved
          ? `Los datos de la comunidad se guardaron, pero no se pudo subir la imagen. ${e.message}`
          : e.message,
        details: e.details,
      });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  if (created && removed.has(created.id)) return <p role="alert">La comunidad ya no está disponible. <Link to="/comunidades">Volver a comunidades</Link></p>;
  if (!canManage) return <p role="alert">No tenés permiso para editar esta comunidad. <Link to={`/comunidades/${comunidad.id}`}>Volver a la comunidad</Link></p>;
  const fieldError = (campo) => error?.details?.find((d) => d.campo === campo)?.message;
  const cancelPath = saved.current ? `/comunidades/${saved.current.id}` : '/comunidades';
  return <form className="community-form" onSubmit={submit} aria-busy={busy}>
    {error && <p role="alert" className="notice error">{error.message}</p>}
    {created && error && <p className="community-help">La comunidad ya fue creada. Podés reintentar o <Link to={`/comunidades/${created.id}`}>abrirla sin cambiar la imagen</Link>.</p>}
    <fieldset disabled={busy}>
      <FormField label="Nombre de la comunidad" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
        required minLength={2} maxLength={64} autoFocus error={fieldError('nombre')} />
      <FormField as="select" label="Tipo de comunidad" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} error={fieldError('tipo')}>
        <option value="PRIVADA">Privada</option>
        <option value="PUBLICA">Pública</option>
      </FormField>
      <p className="community-help">{tipo === 'PRIVADA' ? 'El ingreso requiere una invitación.' : 'El tipo público permite que la comunidad pueda mostrarse en el explorador cuando esté disponible.'}</p>
      <div className="community-image-field">
        <CommunityImage nombre={nombre} url={preview || comunidad?.imagenUrl || saved.current?.imagenUrl} large />
        <div>
          <label htmlFor="community-image-input">{comunidad ? 'Cambiar imagen' : 'Imagen (opcional)'}</label>
          <input ref={fileInput} id="community-image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage}
            aria-invalid={Boolean(imageError)} aria-describedby="community-image-help community-image-error" />
          <p id="community-image-help" className="community-help">JPG, PNG o WebP. Hasta 2 MB.</p>
          {(imagen || imageError) && <button type="button" className="text-button" onClick={() => {
            setImagen(null); setImageError(''); fileInput.current.value = '';
          }}>Quitar selección</button>}
        </div>
      </div>
      <p id="community-image-error" className="field-error" role={imageError ? 'alert' : undefined}>{imageError}</p>
      <div className="community-actions">
        <button type="submit" disabled={Boolean(imageError)}>{busy ? 'Guardando…' : comunidad || created ? 'Guardar cambios' : 'Crear comunidad'}</button>
        {!busy && <Link className="community-cancel" to={cancelPath}>Cancelar</Link>}
      </div>
    </fieldset>
  </form>;
}
