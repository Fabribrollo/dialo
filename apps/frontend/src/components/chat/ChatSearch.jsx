import {useEffect,useState} from 'react';
import Icon from '../ui/Icon.jsx';
import './chatSearch.css';
export function filterMessages(messages,query){const q=query.trim().toLowerCase();return q?messages.filter(m=>!m.eliminado&&m.contenido?.toLowerCase().includes(q)):messages;}
export const setSearchOpen=open=>window.dispatchEvent(new CustomEvent('dialo:search-toggle',{detail:open}));
export default function ChatSearch({onChange}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{const sync=e=>{setOpen(e.detail);if(!e.detail)onChange('');};window.addEventListener('dialo:search-toggle',sync);return()=>window.removeEventListener('dialo:search-toggle',sync);},[onChange]);
 return <button type="button" className="lg pr ib" aria-label="Buscar en la conversación" aria-expanded={open} onClick={()=>setSearchOpen(!open)}><Icon name="buscar" size={19}/></button>;
}
