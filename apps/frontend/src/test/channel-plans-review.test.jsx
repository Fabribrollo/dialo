import PlanAuditDetails from '../components/communities/PlanAuditDetails.jsx';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import ChannelPlanPanel from '../components/channels/ChannelPlanPanel.jsx';
import ContentReviewInbox from '../components/communities/ContentReviewInbox.jsx';
import {api} from '../services/api.js';
const {saved}=vi.hoisted(()=>({saved:vi.fn()}));
vi.mock('../services/api.js',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
vi.mock('../context/UnsavedChangesContext.jsx',()=>({useUnsavedChanges:()=>({markSaved:saved})}));
const old={id:7,nombre:'general',tipo:'TEXTO',privado:false,posicion:0,permisosGlobales:['ESCRIBIR']};
const proposal=()=>({id:'test-proposal',antes:[old],despues:[{...old,nombre:'consultas'}],vence:'2026-12-01T10:00:00Z'});
const caseRow=()=>({id:12,idComunidad:1,idCanal:7,idMensaje:9,estado:'PENDIENTE',motivos:['Repetición'],fechaCreacion:'2026-11-24T01:00:00Z',mensaje:{contenido:'Mensaje señalado',autor:{id:2,nombreVisible:'Beto'},fechaCreacion:'2026-11-24T01:00:00Z'}});
let current;
beforeEach(()=>{
 vi.clearAllMocks();current=caseRow();
 api.get.mockImplementation(async path=>path.endsWith('/settings')?{revisionActiva:true}:path.includes('/cases?')?{items:[current],nextCursor:null}:current);
 api.patch.mockResolvedValue({revisionActiva:false});
 api.post.mockImplementation(async(path,body)=>path.endsWith('/channel-plans')?{propuesta:proposal(),aclaracion:''}:path.endsWith('/resolve')?{...current,estado:body.decision,motivoResolucion:body.motivo,medida:body.medida,resolutor:'Ana',fechaResolucion:'2026-11-24T02:00:00Z'}:{});
});
async function generate(){fireEvent.change(screen.getByLabelText('Cambios que querés hacer'),{target:{value:'Renombrá general a consultas'}});fireEvent.click(screen.getByRole('button',{name:'Preparar propuesta'}));await screen.findByText('Antes y después');}
async function openCase(){render(<ContentReviewInbox id={1}/>);fireEvent.click(await screen.findByRole('button',{name:'Revisar caso #12'}));await screen.findByRole('region',{name:'Detalle del caso 12'});}
it('plan muestra el antes/después y no ejecuta hasta confirmar',async()=>{
 const done=vi.fn();render(<ChannelPlanPanel id={1} onDone={done} onCancel={vi.fn()}/>);await generate();
 expect(api.post).toHaveBeenCalledTimes(1);expect(screen.getByText('general',{selector:'del'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar cambios de canales'}));await waitFor(()=>expect(done).toHaveBeenCalled());
 expect(api.post).toHaveBeenLastCalledWith('/communities/1/channel-plans/test-proposal/confirm',{});expect(saved).toHaveBeenCalled();
});
it('eliminar requiere reconocer explícitamente la pérdida de historial',async()=>{
 api.post.mockResolvedValue({propuesta:{...proposal(),despues:[]},aclaracion:''});render(<ChannelPlanPanel id={1} onDone={vi.fn()} onCancel={vi.fn()}/>);await generate();
 expect(screen.getByRole('button',{name:'Confirmar cambios de canales'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText('Entiendo que estos canales y sus mensajes se eliminarán definitivamente'));
 expect(screen.getByRole('button',{name:'Confirmar cambios de canales'})).toBeEnabled();
});
it('cancelar una vista previa cancela el plan sin confirmarlo',async()=>{
 const cancel=vi.fn();render(<ChannelPlanPanel id={1} onDone={vi.fn()} onCancel={cancel}/>);await generate();fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));await waitFor(()=>expect(cancel).toHaveBeenCalled());expect(api.post).toHaveBeenLastCalledWith('/communities/1/channel-plans/test-proposal/cancel',{});
});
it('un pedido ambiguo muestra la aclaración sin permitir confirmación',async()=>{
 api.post.mockResolvedValue({propuesta:null,aclaracion:'¿Qué canal general querés cambiar?'});render(<ChannelPlanPanel id={1} onDone={vi.fn()} onCancel={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Cambios que querés hacer'),{target:{value:'Renombrá general a consultas'}});fireEvent.click(screen.getByRole('button',{name:'Preparar propuesta'}));await screen.findByText('¿Qué canal general querés cambiar?');expect(screen.queryByRole('button',{name:'Confirmar cambios de canales'})).not.toBeInTheDocument();
});
it('un plan desactualizado queda bloqueado y permite preparar otro',async()=>{
 api.post.mockResolvedValueOnce({propuesta:proposal(),aclaracion:''}).mockRejectedValueOnce(Object.assign(new Error('Generá una propuesta nueva'),{code:'PLAN_STALE'}));render(<ChannelPlanPanel id={1} onDone={vi.fn()} onCancel={vi.fn()}/>);await generate();fireEvent.click(screen.getByRole('button',{name:'Confirmar cambios de canales'}));await screen.findByText('Generá una propuesta nueva');expect(screen.getByRole('button',{name:'Confirmar cambios de canales'})).toBeDisabled();expect(screen.getByRole('button',{name:'Generar otro plan'})).toBeEnabled();
});
it('la bandeja abre el detalle y permite descartar solo con motivo',async()=>{
 await openCase();expect(screen.getByText('Mensaje señalado')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Descartar señalamiento'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'No corresponde a la regla'}});fireEvent.click(screen.getByRole('button',{name:'Descartar señalamiento'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/communities/1/review/cases/12/resolve',{decision:'DESCARTADO',motivo:'No corresponde a la regla'}));await screen.findByText('No corresponde a la regla');
});
it('una medida exige elección, motivo y confirmación explícita sobre la persona',async()=>{
 await openCase();fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'Spam reiterado'}});fireEvent.change(screen.getByLabelText('Iniciar una medida'),{target:{value:'BANEAR'}});expect(screen.getByRole('button',{name:'Confirmar medida y resolver'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Duración del baneo'),{target:{value:'5_HORAS'}});fireEvent.click(screen.getByLabelText('Confirmo esta medida sobre Beto'));fireEvent.click(screen.getByRole('button',{name:'Confirmar medida y resolver'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/communities/1/review/cases/12/resolve',{decision:'CON_MEDIDA',motivo:'Spam reiterado',medida:{tipo:'BANEAR',duracion:'5_HORAS'}}));
});
it('silenciar usa los alcances y duraciones del flujo de moderación integrado',async()=>{
 await openCase();fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'Repetición de mensajes'}});fireEvent.change(screen.getByLabelText('Iniciar una medida'),{target:{value:'SILENCIAR'}});fireEvent.change(screen.getByLabelText('Alcance del silencio'),{target:{value:'AMBOS'}});fireEvent.change(screen.getByLabelText('Duración del silencio'),{target:{value:'24_HORAS'}});fireEvent.click(screen.getByLabelText('Confirmo esta medida sobre Beto'));fireEvent.click(screen.getByRole('button',{name:'Confirmar medida y resolver'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/communities/1/review/cases/12/resolve',{decision:'CON_MEDIDA',motivo:'Repetición de mensajes',medida:{tipo:'SILENCIAR',alcance:'AMBOS',duracion:'24_HORAS'}}));
});
it('un mensaje eliminado permite cerrar sin sanción y oculta medidas',async()=>{
 current={...current,mensaje:null};await openCase();await screen.findByText('Mensaje eliminado o no disponible para tu cuenta.');expect(screen.queryByLabelText('Iniciar una medida')).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'Ya no está disponible'}});fireEvent.click(screen.getByRole('button',{name:'Cerrar sin sanción'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/communities/1/review/cases/12/resolve',{decision:'SIN_SANCION',motivo:'Ya no está disponible'}));
});
it('permite activar detección y cambiar entre pendientes y resueltos',async()=>{
 render(<ContentReviewInbox id={1}/>);const toggle=await screen.findByLabelText('Activar detección para revisión humana');await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/communities/1/review/settings',{activa:false}));fireEvent.click(screen.getByRole('button',{name:'Resueltos'}));await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/communities/1/review/cases?estado=RESUELTOS'));
});
it('una decisión concurrente muestra el conflicto sin afirmar que aplicó una medida',async()=>{
 api.post.mockImplementation(async()=>{current={...current,estado:'DESCARTADO',resolutor:'Ana',motivoResolucion:'Ya revisado',fechaResolucion:'2026-11-24T02:00:00Z'};throw Object.assign(new Error('Otra decisión ya resolvió este caso'),{status:409,code:'CASE_CLOSED'});});await openCase();fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'Revisado'}});fireEvent.click(screen.getByRole('button',{name:'Cerrar sin sanción'}));await screen.findByText('Otra decisión ya resolvió este caso');expect(screen.getByRole('heading',{name:'Caso #12 · Descartado'})).toBeInTheDocument();
});
it('retira contenido visible si el servidor informa pérdida de autorización al actualizar',async()=>{
 await openCase();api.get.mockRejectedValue(Object.assign(new Error('Ya no tenés acceso'),{status:403}));fireEvent.click(screen.getByRole('button',{name:'Actualizar casos'}));await screen.findByText('Ya no tenés acceso');expect(screen.queryByText('Mensaje señalado')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Revisar caso #12'})).not.toBeInTheDocument();
});

it('el registro muestra nombres, orden y eliminaciones del plan confirmado',()=>{
 render(<PlanAuditDetails detalle={{propuesta:'id',antes:[old,{...old,id:8,nombre:'viejo'}],despues:[{...old,nombre:'consultas'}]}}/>);
 fireEvent.click(screen.getByText('Ver cambios de canales'));expect(screen.getByText('general → consultas')).toBeInTheDocument();expect(screen.getByText('Se eliminaron: viejo.')).toBeInTheDocument();
});
