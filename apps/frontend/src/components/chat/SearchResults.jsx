import {useContext,useEffect,useState} from 'react';
import {MessageInteractionContext} from './MessageInteractions.jsx';
import {parseSearch,buildSearch} from '../../utils/searchFilters.js';
import {setSearchOpen} from './ChatSearch.jsx';
import RightPanel from '../shell/RightPanel.jsx';
import Dialog from '../ui/Dialog.jsx';
import Icon from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
function Highlight({text,query}){if(!query)return text;const index=text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());return index<0?text:<>{text.slice(0,index)}<mark>{text.slice(index,index+query.length)}</mark>{text.slice(index+query.length)}</>;}
export default function SearchResults({search,author,value='',onChange}){
 const c=useContext(MessageInteractionContext),[open,setOpen]=useState(false),[wide,setWide]=useState(()=>window.innerWidth>=1366);
 useEffect(()=>{const toggle=e=>setOpen(e.detail),resize=()=>setWide(window.innerWidth>=1366);window.addEventListener('dialo:search-toggle',toggle);window.addEventListener('resize',resize);return()=>{window.removeEventListener('dialo:search-toggle',toggle);window.removeEventListener('resize',resize);setSearchOpen(false);};},[]);
 const criteria=parseSearch(value),change=(key,v)=>onChange?.(buildSearch({...criteria,[key]:v}));
 const close=()=>{setSearchOpen(false);onChange?.('');};
 if(!open)return null;
 const content=<section className="message-search-panel" aria-label="Resultados de todo el historial"><header><button type="button" className="ib" aria-label="Cerrar búsqueda" onClick={close}><Icon name="cerrar" size={19}/></button><h2>Buscar mensajes</h2></header><label className="message-search-input"><Icon name="buscar" size={18}/><input autoFocus aria-label="Buscar mensajes" placeholder="Buscar mensajes" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}}} value={criteria.text} onChange={e=>change('text',e.target.value)}/>{criteria.text&&<button type="button" aria-label="Borrar búsqueda" onClick={()=>change('text','')}>×</button>}</label><label className="message-search-date"><span>Fecha</span><input type="date" aria-label="Fecha de los mensajes" value={criteria.fecha} onChange={e=>change('fecha',e.target.value)}/>{criteria.fecha&&<button type="button" onClick={()=>change('fecha','')}>Quitar fecha</button>}</label><div className="message-search-scroll">{search.loading&&<p role="status">Buscando…</p>}{search.error&&<Notice title={search.error}/>} {!search.active?<p className="search-hint">Buscá una palabra o elegí una fecha.</p>:!search.loading&&!search.error&&!search.items.length?<p className="search-hint">No encontramos mensajes.</p>:null}<ol>{search.items.map(m=><li key={m.id}><button type="button" className="search-result" aria-label={`Ir al mensaje: ${m.contenido==='Archivo adjunto'?'Recurso compartido':m.contenido}`} onClick={()=>{c?.locate(m);close();}}><time>{new Date(m.fechaCreacion).toLocaleDateString('es-AR')}</time><span className="search-result-author">{m.autor?.nombreVisible||author?.(m)||'Mensaje'}</span><span className="search-result-text"><Highlight text={m.contenido==='Archivo adjunto'?(m.adjunto?.tipo?.startsWith('audio/')?'Audio':'Recurso compartido'):m.contenido??''} query={criteria.text}/></span></button></li>)}</ol>{search.cursor&&<button type="button" className="search-more" disabled={search.loading} onClick={search.more}>Cargar más resultados</button>}</div></section>;
 return wide?<RightPanel label="Buscar mensajes">{content}</RightPanel>:<Dialog open label="Buscar mensajes" onClose={close} className="search-drawer">{content}</Dialog>;
}
