import { useState } from 'react';
import Button, { IconButton, LinkButton } from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Notice from '../components/ui/Notice.jsx';
import Field, { CheckField } from '../components/ui/Field.jsx';
import EmptyState, { Loading } from '../components/ui/EmptyState.jsx';
import Avatar, { AvatarGroup } from '../components/ui/Avatar.jsx';
import CommunityTile from '../components/ui/CommunityTile.jsx';
import { ConfirmDialog } from '../components/ui/Dialog.jsx';
import Menu, { MenuItem, MenuLabel } from '../components/ui/Menu.jsx';

const grupo = [{ id: 1, nombre: 'Tomi' }, { id: 2, nombre: 'Cande' }, { id: 3, nombre: 'Lu' }, ...Array.from({ length: 11 }, (_, i) => ({ id: i + 4, nombre: 'X' }))];
const estados = [['EN_LINEA', 'En línea'], ['AUSENTE', 'Ausente'], ['NO_MOLESTAR', 'No molestar'], ['INVISIBLE', 'Invisible']];
import '../styles/devComponents.css';

const iconos = [
  ['comunidades', 'Comunidades'], ['mensajes', 'Mensajes'], ['amigos', 'Amigos'], ['perfil', 'Perfil'],
  ['enviar', 'Enviar'], ['flecha', 'Flecha'], ['cerrarSesion', 'Cerrar sesión'], ['microfono', 'Micrófono'],
  ['silenciado', 'Silenciado'], ['camara', 'Cámara'], ['pantalla', 'Pantalla'], ['canalVoz', 'Canal de voz'],
  ['canalTexto', 'Canal de texto'], ['privado', 'Privado'], ['ia', 'IA'], ['moderacion', 'Moderación'],
];

function Muestra({ cap, children }) {
  return <div className="dev-col">{children}<span className="dev-cap">{cap}</span></div>;
}

export default function DevComponentsPage() {
  const [bio, setBio] = useState('Estudio Redes en la UTN. Me copan los mates y el rack del labo.');
  const [privado, setPrivado] = useState(true);
  const [dialogo, setDialogo] = useState(null);
  const [menu, setMenu] = useState(false);
  const [estado, setEstado] = useState('EN_LINEA');

  return (
    <div className="dev-page">
      <div className="dev-wrap">
        <header className="dev-head">
          <h1 className="dsp">Componentes</h1>
        </header>
        <div className="dev-grid">
          <section className="win dev-sec dev-span2">
            <h2>Botones</h2>
            <div className="dev-row">
              <Muestra cap="Primario"><Button>Crear comunidad</Button></Muestra>
              <Muestra cap="Secundario"><Button variant="secundario">Cancelar</Button></Muestra>
              <Muestra cap="Peligro"><Button variant="peligro">Eliminar canal</Button></Muestra>
              <Muestra cap="Deshabilitado"><Button disabled>Guardar cambios</Button></Muestra>
              <Muestra cap="Cargando"><Button loading>Guardando…</Button></Muestra>
            </div>
            <div className="dev-row dev-row-wide">
              <Muestra cap="Botones de ícono">
                <span className="dev-row">
                  <IconButton label="Buscar"><Icon name="mensajes" /></IconButton>
                  <IconButton variant="oscuro" label="Micrófono"><Icon name="microfono" /></IconButton>
                  <IconButton variant="peligro" label="Salir de la llamada"><Icon name="cerrarSesion" /></IconButton>
                  <IconButton variant="primario" label="Enviar"><Icon name="enviar" size={19} stroke={2.3} /></IconButton>
                </span>
              </Muestra>
              <Muestra cap="Botón-link: primario y secundario">
                <span className="dev-row dev-h46">
                  <LinkButton>Registrate</LinkButton>
                  <LinkButton variant="secundario">Olvidé mi contraseña</LinkButton>
                </span>
              </Muestra>
            </div>
          </section>

          <section className="win dev-sec dev-span2">
            <h2>Campos de formulario</h2>
            <div className="dev-fields">
              <Field label="Nombre visible" defaultValue="Tu nombre" />
              <Field label="Correo" defaultValue="tucorreo@correo.com" />
              <Field label="Tipo" as="select" defaultValue="PUBLICA">
                <option value="PUBLICA">Pública</option>
                <option value="PRIVADA">Privada</option>
              </Field>
              <Field label="Nombre de la comunidad" defaultValue="A" error="Tiene que tener entre 2 y 64 caracteres." />
              <Field label="Usuario" defaultValue="tuusuario" disabled note="No se puede cambiar" />
              <div className="fld">
                <span className="fl">Privacidad</span>
                <CheckField label="Canal privado" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
              </div>
            </div>
            <Field label="Información personal" as="textarea" maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} />
          </section>

          <section className="win dev-sec">
            <h2>Insignias</h2>
            <div className="dev-row dev-g8">
              <Badge kind="texto" /><Badge kind="voz" /><Badge kind="privado" /><Badge kind="publica" />
            </div>
            <div className="dev-row dev-g8">
              <Badge kind="conCamara" /><Badge kind="silenciado" /><Badge kind="comparte" />
            </div>
          </section>

          <section className="win dev-sec">
            <h2>Avisos</h2>
            <Notice tone="error" title="No pudimos guardar los cambios" actionLabel="Reintentar">Revisá tu conexión y probá de nuevo.</Notice>
            <Notice tone="exito" title="Cambios guardados">Tu perfil ya está actualizado.</Notice>
            <Notice tone="conflicto" title="El canal pudo cambiar en otra sesión" actionLabel="Recargar formulario">Recargá para ver la última versión antes de guardar.</Notice>
          </section>

          <section className="win dev-sec">
            <h2>Íconos</h2>
            <div className="dev-icons">
              {iconos.map(([name, cap]) => (
                <span key={name} className="dev-col dev-center">
                  <span className="dev-ico"><Icon name={name} size={21} /></span>
                  <span className="dev-cap">{cap}</span>
                </span>
              ))}
              <span className="dev-col dev-center">
                <span className="dev-ico dev-ico-dk"><Icon name="marca" size={16} /></span>
                <span className="dev-cap">Marca</span>
              </span>
            </div>
          </section>

          <section className="win dev-sec">
            <h2>Avatar y presencia</h2>
            <div className="dev-row">
              {estados.map(([p, cap]) => <Muestra key={p} cap={cap}><Avatar nombre="Tu Nombre" size={38} presence={p} /></Muestra>)}
            </div>
            <div className="dev-row">
              <Muestra cap="40 px"><Avatar nombre="Tomi Sosa" /></Muestra>
              <Muestra cap="Vos"><Avatar nombre="Tu nombre" size={38} dark presence="EN_LINEA" /></Muestra>
              <Muestra cap="Grupo"><AvatarGroup people={grupo} /></Muestra>
              <Muestra cap="Comunidad"><CommunityTile nombre="Taller Redes" /></Muestra>
            </div>
          </section>

          <section className="win dev-sec">
            <h2>Diálogos y menú</h2>
            <div className="dev-row">
              <Button variant="secundario" onClick={() => setDialogo('simple')}>Confirmar</Button>
              <Button variant="secundario" onClick={() => setDialogo('error')}>Con error</Button>
              <Button variant="secundario" onClick={() => setDialogo('nombre')}>Escribir nombre</Button>
            </div>
            <div style={{ position: 'relative' }}>
              <Button variant="secundario" onClick={() => setMenu(true)}>Menú de estado</Button>
              <Menu open={menu} onClose={() => setMenu(false)} label="Estado">
                <MenuLabel>Estado</MenuLabel>
                {estados.map(([p, cap]) => (
                  <MenuItem key={p} selected={estado === p} onClick={() => { setEstado(p); setMenu(false); }}>{cap}</MenuItem>
                ))}
              </Menu>
            </div>
            <ConfirmDialog
              open={dialogo !== null}
              title={dialogo === 'nombre' ? '¿Transferir la propiedad a Cande Ríos?' : '¿Eliminar #apuntes?'}
              confirmLabel={dialogo === 'nombre' ? 'Transferir propiedad' : 'Eliminar canal'}
              confirmVariant={dialogo === 'nombre' ? 'primario' : 'peligro'}
              cancelLabel={dialogo === 'nombre' ? 'Volver' : 'Cancelar'}
              confirmText={dialogo === 'nombre' ? 'Taller de Redes' : undefined}
              error={dialogo === 'error' ? 'No pudimos eliminar el canal. Probá de nuevo.' : undefined}
              onCancel={() => setDialogo(null)}
              onConfirm={() => setDialogo(null)}
            >
              {dialogo === 'nombre'
                ? 'Cande pasa a tener el rol de propietario y vos quedás como Admin. No se puede deshacer: solo Cande te la puede devolver.'
                : 'Se eliminan el canal, sus mensajes y sus permisos. No se puede deshacer.'}
            </ConfirmDialog>
          </section>

          <section className="win dev-sec">
            <h2>Vacío y cargando</h2>
            <EmptyState icon="amigos" title="Todavía no tenés amigos" actionLabel="Buscar personas">
              Buscá a alguien por su usuario y mandale una solicitud.
            </EmptyState>
            <Loading />
          </section>
        </div>
      </div>
    </div>
  );
}
