import {permissionLabels} from '../../utils/permissionCatalog.js';
export default function PlanAuditDetails({detalle}){
 if(!detalle?.propuesta||!Array.isArray(detalle.antes)||!Array.isArray(detalle.despues))return null;
 const deleted=detalle.antes.filter(c=>!detalle.despues.some(next=>next.id===c.id));
 return <details><summary>Ver cambios de canales</summary><ol>{detalle.despues.map((next,index)=>{const old=detalle.antes.find(c=>c.id===next.id);return <li key={next.id} style={{display:'list-item'}}><p><strong>{old?old.nombre===next.nombre?next.nombre:`${old.nombre} → ${next.nombre}`:`Nuevo: ${next.nombre}`}</strong> · posición {index+1}</p><p>{next.privado?'Privado':`Permisos: ${next.permisosGlobales.map(p=>permissionLabels[p]??p).join(', ')||'Solo lectura'}`}</p></li>;})}</ol>{deleted.length>0&&<p>Se eliminaron: {deleted.map(c=>c.nombre).join(', ')}.</p>}</details>;
}
