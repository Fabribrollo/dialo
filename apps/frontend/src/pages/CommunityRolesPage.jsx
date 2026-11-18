import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import CommunityRoleFormDialog from '../components/communities/CommunityRoleFormDialog.jsx';
import Field from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { ListRow } from '../components/ui/Card.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import '../styles/members.css';
import '../styles/roles.css';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
import * as service from '../services/communityRolesService.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import { COMMUNITY_ROLES } from './CommunitiesPage.jsx';
const reserved = new Set(Object.keys(COMMUNITY_ROLES).map((role) => role.toLowerCase()));
function RolesCatalog({ detail }) {
  const { id, miRol } = detail.comunidad;
  const list = useCommunityCollection(id, service.getCommunityRoles);
  const allowed = ['ADMIN', 'PROPIETARIO'].includes(miRol);
  const [action, setAction] = useState(null), [nombre, setNombre] = useState(''), [notice, setNotice] = useState('');
  const trigger = useRef(null), heading = useRef(null);
  const current = list.items.find((role) => role.id === action?.role?.id);
  const stale = action?.role && (!current || current.nombre !== action.role.nombre);
  const blocked = !allowed ? 'Tu rol ya no permite administrar este catálogo.'
    : list.refreshing ? 'Verificando el catálogo…'
      : list.error ? 'No se pudo verificar el catálogo. Cerrá el formulario y reintentá.'
      : stale ? 'Este rol cambió en otra pestaña. Cerrá y abrí el formulario para cargar la versión vigente.' : '';
  function open(event, type, role) {
    trigger.current = event.currentTarget;
    setNotice('');
    setNombre(role?.nombre ?? '');
    setAction({ type, role });
  }
  function close(message) {
    setAction(null);
    if (message) setNotice(message);
  }
  async function mutate(operation) {
    try {
      await operation();
      void list.reload();
    } catch (error) {
      if ([401, 403, 404, 409].includes(error.status)) {
        detail.reload();
        void list.reload();
      }
      throw error;
    }
  }
  const base = [['PROPIETARIO', 'Todo, incluso eliminar la comunidad.'], ['ADMIN'], ['MODERADOR'], ['INTEGRANTE', 'Ve y participa en los canales públicos.']];
  return <>
    <h1 tabIndex={-1} ref={heading} className="sr-only">Roles</h1>
    {detail.error && <Notice tone="error" title="No se pudo actualizar la comunidad." actionLabel="Reintentar" onAction={detail.reload} />}
    {notice && <Notice tone="exito" title={notice} />}
    <h2 className="page-h2 cr-h2">Roles base</h2>
    <div className="cr-base">
      {base.map(([rol, texto]) => <Card key={rol} className="cr-base-card">
        <span className="cr-base-name">{COMMUNITY_ROLES[rol]}</span>
        {texto && <span className="li-sub">{texto}</span>}
      </Card>)}
    </div>
    <div className="cr-custom-head">
      <h2 className="page-h2 cr-h2">Roles personalizados</h2>
      {allowed && !list.loading && !list.error && <Button onClick={(e) => open(e, 'create')}><Icon name="mas" size={15} stroke={2.2} />Crear rol</Button>}
    </div>
    {list.error && <Notice tone="error" title={list.error.message} actionLabel="Reintentar" onAction={() => { detail.reload(); list.reload(); }} />}
    {list.loading ? <span className="cm-state" role="status"><Spinner size={15} />Cargando roles…</span> : <>
      {!list.error && !list.items.length && <span className="cm-state">Todavía no hay roles personalizados.</span>}
      {list.items.length > 0 && <Card as="ul">{list.items.map((role) => <ListRow as="li" key={role.id}>
        <span className="cr-dot" />
        <span className="li-text"><span className="li-title cr-name">{role.nombre}</span></span>
        {allowed && !list.error && <>
          <Button size="sm" variant="secundario" onClick={(e) => open(e, 'edit', role)} aria-label={`Editar ${role.nombre}`}>Editar</Button>
          <button type="button" className="li-quiet cm-ban pr" onClick={(e) => open(e, 'delete', role)} aria-label={`Eliminar ${role.nombre}`}>Eliminar</button>
        </>}
      </ListRow>)}</Card>}
    </>}
    {action && action.type !== 'delete' && <CommunityRoleFormDialog title={action.type === 'create' ? 'Crear rol' : `Editar ${action.role.nombre}`}
      blocked={blocked} onClose={close} returnFocusRef={trigger} fallbackFocusRef={heading}
      onSave={async () => {
        const name = nombre.trim();
        if (!name || name.length > 32 || reserved.has(name.toLowerCase())) {
          throw new Error('Ingresá un nombre de hasta 32 caracteres distinto de los roles base.');
        }
        await mutate(() => action.type === 'create' ? service.createCommunityRole(id, { nombre: name })
          : service.updateCommunityRole(id, action.role.id, { nombre: name }));
        return action.type === 'create' ? 'Rol creado.' : 'Rol actualizado.';
      }}>
      <Field label="Nombre del rol" value={nombre} maxLength={32} onChange={(e) => setNombre(e.target.value)} autoFocus required />
    </CommunityRoleFormDialog>}
    {action?.type === 'delete' && <CommunityRoleFormDialog title={`¿Eliminar ${action.role.nombre}?`}
      destructive confirmLabel="Eliminar rol" blocked={blocked} onClose={close} returnFocusRef={trigger} fallbackFocusRef={heading}
      onSave={async () => {
        await mutate(() => service.deleteCommunityRole(id, action.role.id));
        return 'Rol eliminado.';
      }}>
      <p>Se quitarán sus asignaciones y permisos por canal. Los integrantes seguirán en la comunidad y conservarán los permisos que reciben por otras vías.</p>
    </CommunityRoleFormDialog>}
  </>;
}
export default function CommunityRolesPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad}>
      <RolesCatalog key={id} detail={detail} />
  </CommunityShell>;
}
