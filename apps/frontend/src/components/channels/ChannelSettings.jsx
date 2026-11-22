import {useGuardedAction} from '../../context/UnsavedChangesContext.jsx';
import {useState} from 'react';
import ChannelForm from './ChannelForm.jsx';import ChannelAccessForm from './ChannelAccessForm.jsx';import ChannelMemberActions from './ChannelMemberActions.jsx';import ChannelRequests from './ChannelRequests.jsx';
import Button from '../ui/Button.jsx';import Segmented from '../ui/Segmented.jsx';
export default function ChannelSettings({canal,admin,version,onSaved,onCancel,onReload,onUnavailable,onDelete,initial,onTabChange}){
 const guard=useGuardedAction();
 const manage=admin||canal.misPermisos.includes('GESTIONAR_CANALES');
 const tabs=[...(manage?[{value:'general',label:'General'}]:[]),...(!canal.privado&&manage?[{value:'permissions',label:'Permisos'}]:[]),...((canal.privado&&admin)||canal.misPermisos.some(p=>['EXPULSAR','SILENCIAR'].includes(p))?[{value:'members',label:'Integrantes'}]:[]),...(canal.privado&&admin?[{value:'requests',label:'Solicitudes'}]:[])];
 const [tab,setTab]=useState(tabs.some(t=>t.value===initial)?initial:tabs[0]?.value??'general');
 return <section className="channel-settings"><header><h1 className="dsp">Ajustes de #{canal.nombre}</h1><Button variant="secundario" onClick={()=>guard(onCancel)}>Volver al canal</Button></header><Segmented label="Ajustes del canal" options={tabs} value={tab} onChange={value=>{if(value!==tab)guard(()=>{setTab(value);onTabChange?.(value);});}}/>
 {tab==='general'&&manage&&<ChannelForm canal={canal} version={version} onSaved={onSaved} onCancel={onCancel} onReload={onReload} onUnavailable={onUnavailable} onDelete={onDelete}/>}
 {tab==='permissions'&&manage&&!canal.privado&&<ChannelAccessForm canal={canal} version={version} onSaved={()=>onSaved()} onCancel={onCancel} onReload={onReload} onUnavailable={onUnavailable}/>}
 {tab==='members'&&(canal.privado&&admin?<ChannelAccessForm canal={canal} version={version} onSaved={()=>onSaved()} onCancel={onCancel} onReload={onReload} onUnavailable={onUnavailable}/>:<ChannelMemberActions canal={canal} embedded/>)}
 {tab==='requests'&&admin&&canal.privado&&<ChannelRequests canal={canal} onChanged={onReload} onCancel={onCancel}/>}
 </section>;
}
