import {permissionLabels,basePermissions,specialPermissions} from '../../utils/permissionCatalog.js';
import './channelAccess.css';
const keys=tipo=>tipo==='TODOS'?[...basePermissions,...specialPermissions]:tipo==='TEXTO'?['ESCRIBIR','ELIMINAR_MENSAJES','GESTIONAR_CANALES','EXPULSAR']:['HABLAR','CAMARA','PANTALLA','SILENCIAR','GESTIONAR_CANALES','EXPULSAR'];
export const permissionOptions=tipo=>keys(tipo).map(p=>[p,permissionLabels[p]]);
export function togglePermission(values,permission,checked){const next=new Set(values.flatMap(p=>p==='TRANSMITIR'?['CAMARA','PANTALLA']:[p]));if(checked)next.add(permission);else next.delete(permission);return [...next];}
export default function PermissionPills({tipo,value,onChange,label='Permisos globales'}){
 const values=value.flatMap(p=>p==='TRANSMITIR'?['CAMARA','PANTALLA']:[p]);const allowed=keys(tipo);
 return <fieldset className="permission-groups"><legend className="sr-only">{label}</legend>{[[basePermissions,'Permisos base'],[specialPermissions,'Permisos especiales']].map(([group,title])=><fieldset key={title} className="cpa-row"><legend className="fl">{title}</legend><span className="cpa-pills">{group.filter(p=>allowed.includes(p)).map(p=><label key={p} className={`cpa-pill ${values.includes(p)?'cpa-on':''}`}><input type="checkbox" aria-label={`${label}: ${permissionLabels[p]}`} checked={values.includes(p)} onChange={e=>onChange(togglePermission(values,p,e.target.checked))}/>{permissionLabels[p]}</label>)}</span></fieldset>)}</fieldset>;
}
