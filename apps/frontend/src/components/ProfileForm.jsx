import { useState } from 'react';
import FormField from './FormField.jsx';
import { useProfile } from '../hooks/useProfile.js';
import { useSubmit } from '../hooks/useSubmit.js';

export default function ProfileForm() {
  const { usuario, updateProfile, updateAvatar } = useProfile();
  const datos = useSubmit(updateProfile);
  const foto = useSubmit(updateAvatar);
  const [guardado, setGuardado] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setGuardado(false);
    const { nombreVisible, informacionPersonal, disponibilidad } = Object.fromEntries(new FormData(event.target));
    const ok = await datos.submit({
      nombreVisible,
      informacionPersonal: informacionPersonal.trim() || null,
      disponibilidad,
    });
    setGuardado(ok);
  }

  function onFoto(event) {
    const archivo = event.target.files[0];
    if (archivo) foto.submit(archivo);
    event.target.value = '';
  }

  return (
    <div className="profile">
      <div className="profile-header">
        {usuario.fotoUrl ? (
          <img className="avatar" src={usuario.fotoUrl} alt="" width="96" height="96" />
        ) : (
          <div className="avatar" aria-hidden="true">
            {usuario.nombreVisible[0].toUpperCase()}
          </div>
        )}
        <div>
          <p>
            <strong>{usuario.nombreVisible}</strong>
          </p>
          <p>
            @{usuario.nombreUsuario} · {usuario.correo}
          </p>
        </div>
      </div>

      <FormField
        label={foto.enviando ? 'Subiendo foto…' : 'Cambiar foto (JPG, PNG o WebP, hasta 2 MB)'}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={foto.enviando}
        onChange={onFoto}
        error={foto.error?.message}
      />

      <form onSubmit={onSubmit}>
        {datos.error && (
          <p role="alert" className="form-error">
            {datos.error.message}
          </p>
        )}
        <FormField
          label="Nombre visible"
          name="nombreVisible"
          defaultValue={usuario.nombreVisible}
          required
          error={datos.errorDe('nombreVisible')}
        />
        <FormField
          as="textarea"
          label="Información personal"
          name="informacionPersonal"
          rows="3"
          defaultValue={usuario.informacionPersonal ?? ''}
          error={datos.errorDe('informacionPersonal')}
        />
        <FormField
          as="select"
          label="Estado"
          name="disponibilidad"
          defaultValue={usuario.disponibilidad}
          error={datos.errorDe('disponibilidad')}
        >
          <option value="EN_LINEA">En línea</option>
          <option value="AUSENTE">Ausente</option>
          <option value="NO_MOLESTAR">No molestar</option>
          <option value="INVISIBLE">Invisible</option>
        </FormField>
        <button disabled={datos.enviando}>Guardar cambios</button>
        {guardado && <p role="status">Cambios guardados.</p>}
      </form>
    </div>
  );
}
