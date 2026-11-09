import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import CommunityNav from '../components/communities/CommunityNav.jsx';
import CommunityRoleFormDialog from '../components/communities/CommunityRoleFormDialog.jsx';
import FormField from '../components/FormField.jsx';
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

  return <>
    <header className="page-heading community-page-heading">
      <div><h1 tabIndex={-1} ref={heading}>Roles</h1><p>{detail.comunidad.nombre}</p></div>
      {allowed && !list.loading && !list.error && <button type="button" onClick={(e) => open(e, 'create')}>Crear rol</button>}
    </header>
    {detail.error && <p role="alert" className="notice error">No se pudo actualizar la comunidad. {detail.error.message}</p>}
    {notice && <p role="status" className="community-success">{notice}</p>}
    <h2>Roles base</h2>
    <p className="community-help">Definen la jerarquía de la comunidad. No se pueden renombrar ni eliminar.</p>
    <ul className="community-role-tags">{Object.values(COMMUNITY_ROLES).map((label) => <li key={label}>{label}</li>)}</ul>
    <h2>Roles personalizados</h2>
    <p className="community-help">Se asignan desde Integrantes. Los permisos por canal se administran por separado.</p>
    {list.error && <p role="alert" className="notice error">{list.error.message} <button type="button" className="secondary" onClick={() => { detail.reload(); list.reload(); }}>Reintentar</button></p>}
    {list.loading ? <p role="status">Cargando roles…</p> : <>
      {!list.error && !list.items.length && <p className="center-note">Todavía no hay roles personalizados.</p>}
      <ul className="community-list">{list.items.map((role) => <li key={role.id} className="community-member-row community-role-row">
        <strong>{role.nombre}</strong>
        {allowed && !list.error && <div className="community-role-actions">
          <button type="button" className="secondary" onClick={(e) => open(e, 'edit', role)} aria-label={`Editar ${role.nombre}`}>Editar</button>
          <button type="button" className="secondary danger" onClick={(e) => open(e, 'delete', role)} aria-label={`Eliminar ${role.nombre}`}>Eliminar</button>
        </div>}
      </li>)}</ul>
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
      <FormField label="Nombre del rol" value={nombre} maxLength={32} onChange={(e) => setNombre(e.target.value)} autoFocus required />
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
  return <section className="page-container communities-page">
    <Link className="community-back" to={detail.valid ? `/comunidades/${id}` : '/comunidades'}>← Volver a la comunidad</Link>
    {!detail.comunidad ? <CommunityState {...detail} /> : <>
      <CommunityNav comunidad={detail.comunidad} />
      <RolesCatalog key={id} detail={detail} />
    </>}
  </section>;
}
