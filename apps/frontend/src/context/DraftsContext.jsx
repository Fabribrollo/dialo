import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {useSocket} from '../hooks/useSocket.js';
const Context=createContext(null);
export function DraftsProvider({children}){
 const [drafts,setDrafts]=useState({canal:{},conversacion:{}});const socket=useSocket(),recency=useRef({canal:new Map(),conversacion:new Map()});
 useEffect(()=>{const lost=payload=>{const id=payload?.idCanal??payload?.canal?.id;if(!id)return;setDrafts(old=>({...old,canal:Object.fromEntries(Object.entries(old.canal).filter(([key])=>Number(key)!==Number(id)))}));};socket?.on('channel:access-lost',lost);socket?.on('channel:deleted',lost);return()=>{socket?.off('channel:access-lost',lost);socket?.off('channel:deleted',lost);};},[socket]);
 function update(kind,action){setDrafts(old=>{const next=typeof action==='function'?action(old[kind]):action;const entries=Object.entries(next).filter(([,text])=>text),order=recency.current[kind],keys=new Set(entries.map(([key])=>key));for(const key of order.keys())if(!keys.has(key))order.delete(key);for(const [key,text] of entries)if(text!==old[kind][key]||!order.has(key)){order.delete(key);order.set(key,true);}const keep=new Set([...order.keys()].slice(-50));return {...old,[kind]:Object.fromEntries(entries.filter(([key])=>keep.has(key)))};});}
 return <Context.Provider value={{drafts,update}}>{children}</Context.Provider>;
}
// Memoria de esta sesión: sin localStorage, no sobrevive a cerrar sesión ni recargar.
export function useDraftMap(kind){const context=useContext(Context);const [local,setLocal]=useState({});return context?[context.drafts[kind],action=>context.update(kind,action)]:[local,setLocal];}
