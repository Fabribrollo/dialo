import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {api} from '../services/api.js';
import {useSocket} from '../hooks/useSocket.js';
import {useAuth} from '../hooks/useAuth.js';
const empty={items:[],loading:false,get:()=>({archivado:false,oculto:false,noLeidos:0}),reload:()=>{},change:async()=>{}};
const Context=createContext(empty);
export function ChatStateProvider({children}){
 const {usuario}=useAuth()??{};const socket=useSocket();const [items,setItems]=useState([]),[loading,setLoading]=useState(true);const seq=useRef(0),alive=useRef(true);
 const reload=useCallback(async()=>{const current=++seq.current;try{const data=await api.get('/chat-state');if(alive.current&&current===seq.current)setItems(data.items);}catch{}finally{if(alive.current&&current===seq.current)setLoading(false);}},[usuario?.id]);
 useEffect(()=>{alive.current=true;setItems([]);setLoading(true);reload();return()=>{alive.current=false;seq.current++;};},[reload]);
 useEffect(()=>{let timer;const update=()=>{clearTimeout(timer);timer=setTimeout(reload,60);};const events=['chat-state:changed','message:new','channel-message:new','private-call:changed','community:left','community:member-updated','channel:access-lost','channel:updated','channel:deleted','community:activity-changed','connect'];events.forEach(e=>socket?.on(e,update));window.addEventListener('focus',update);const interval=setInterval(()=>{if(document.visibilityState!=='hidden')update();},30000);return()=>{clearInterval(interval);clearTimeout(timer);events.forEach(e=>socket?.off(e,update));window.removeEventListener('focus',update);};},[socket,reload]);
 const change=useCallback(async(tipo,destino,body)=>{await api.patch(`/chat-state/${tipo}/${destino}`,body);await reload();},[reload]);
 return <Context.Provider value={{items,loading,reload,change,get:(tipo,destino)=>items.find(s=>s.tipo===tipo&&s.destino===destino)??empty.get()}}>{children}</Context.Provider>;
}
export const useChatStates=()=>useContext(Context);
export function useReadChat(tipo,id,lastMessage,enabled=true){
 const {change}=useChatStates();const last=useRef(null);
 useEffect(()=>{const mark=()=>{if(!enabled)return;const key=`${tipo}:${id}:${lastMessage??0}`;if(document.visibilityState==='hidden'||(document.hasFocus&&!document.hasFocus())||last.current===key)return;last.current=key;change(tipo,id,{leido:true}).catch(()=>{last.current=null;});};mark();window.addEventListener('focus',mark);document.addEventListener('visibilitychange',mark);return()=>{window.removeEventListener('focus',mark);document.removeEventListener('visibilitychange',mark);};},[tipo,id,lastMessage,change,enabled]);
}
