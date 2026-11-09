import { useState } from 'react';
import FormField from '../FormField.jsx';
import CommunityRoleFormDialog from './CommunityRoleFormDialog.jsx';
import { COMMUNITY_ROLES } from '../../pages/CommunitiesPage.jsx';
import { updateCommunityMemberRoles } from '../../services/communityRolesService.js';

const rank = { INTEGRANTE: 1, MODERADOR: 2, ADMIN: 3, PROPIETARIO: 4 };
const ids = (member) => (member.rolesPersonalizados ?? []).map((role) => role.id).sort((a, b) => a - b);
export function canManageMember(actor, userId, member) {
  return Boolean(member && rank[actor] >= rank.ADMIN && rank[actor] > rank[member.rol] && member.usuario.id !== userId);
}

export default function MemberRolesDialog({ id, actor, userId, original, member, catalog, list, detail, onClose, returnFocusRef, fallbackFocusRef }) {
  const [rol, setRol] = useState(original.rol), [selected, setSelected] = useState(() => ids(original));
  const initialIds = ids(original);
  const stale = member && (member.rol !== original.rol || ids(member).join() !== initialIds.join());
  const missing = selected.some((idRol) => !catalog.items.some((role) => role.id === idRol));
  const blocked = !canManageMember(actor, userId, member) ? 'Ya no podés modificar los roles de este integrante.'
    : catalog.loading || catalog.refreshing || list.refreshing ? 'Verificando roles vigentes…'
      : catalog.error || list.error || detail.error ? 'No se pudo verificar el estado vigente. Cerrá y reintentá.'
        : stale || missing ? 'Los roles cambiaron. Cerrá y abrí el formulario para cargar el estado vigente.' : '';
  const baseRoles = Object.keys(rank).filter((role) => rank[role] < rank[actor]);

  async function save() {
    const body = {};
    const sorted = [...selected].sort((a, b) => a - b);
    if (rol !== original.rol) body.rol = rol;
    if (sorted.join() !== initialIds.join()) body.idsRoles = sorted;
    if (sorted.length > 50) throw new Error('Podés asignar hasta 50 roles personalizados.');
    if (!Object.keys(body).length) return;
    try {
      await updateCommunityMemberRoles(id, original.usuario.id, body);
      void list.reload();
      return 'Roles actualizados.';
    } catch (error) {
      if ([401, 403, 404, 409].includes(error.status)) {
        detail.reload();
        void list.reload();
        void catalog.reload();
      }
      throw error;
    }
  }

  return <CommunityRoleFormDialog title={`Editar roles de ${original.usuario.nombreVisible}`} blocked={blocked} onSave={save}
    onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}>
    <FormField as="select" label="Rol base" value={rol} onChange={(e) => setRol(e.target.value)} autoFocus>
      {baseRoles.map((role) => <option key={role} value={role}>{COMMUNITY_ROLES[role]}</option>)}
    </FormField>
    <fieldset className="community-role-options">
      <legend>Roles personalizados</legend>
      {!catalog.items.length && <p className="community-help">No hay roles personalizados para asignar.</p>}
      {catalog.items.map((role) => <label key={role.id}>
        <input type="checkbox" checked={selected.includes(role.id)} onChange={(e) => {
          const checked = e.target.checked;
          setSelected((old) => checked ? [...old, role.id] : old.filter((id) => id !== role.id));
        }} />
        <span>{role.nombre}</span>
      </label>)}
    </fieldset>
  </CommunityRoleFormDialog>;
}
