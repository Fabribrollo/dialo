import {useEffect,useRef,useState} from 'react';
import {api} from '../services/api.js';

// Sin caché persistente: cada respuesta sigue pasando por la autorización HTTP.
export function useCommunityActivity(communities,socket,onCalls){
 const [activity,setActivity]=useState({}),[calls,setCalls]=useState({});
 const listener=useRef(onCalls);listener.current=onCalls;
 const ids=communities.map(c=>c.id).sort((a,b)=>a-b).join(',');
 useEffect(()=>{
  const known=ids?ids.split(',').map(Number):[],allowed=new Set(known),versions=new Map();
  let alive=true,running=false,debounce;const pending=new Set();
  setActivity({});setCalls({});
  async function drain(){
   if(!alive||running||!pending.size)return;running=true;
   const batch=[...pending];pending.clear();const results={},callResults={};
   // Limitar concurrencia evita saturar el pool en cuentas con muchas comunidades.
   for(let start=0;start<batch.length&&alive;start+=4)await Promise.all(batch.slice(start,start+4).map(async id=>{
    const version=versions.get(id)??0;
    try{
     const a=await api.get(`/communities/${id}/activity`);
     if(!alive||version!==(versions.get(id)??0))return;
     results[id]=a.participantes?`${a.participantes} en llamada`:a.ultimoMensaje?`${a.ultimoMensaje.canal}: ${a.ultimoMensaje.contenido}`:'';
     callResults[id]=a.llamada??null;
    }catch{if(alive&&version===(versions.get(id)??0)){results[id]='';callResults[id]=null;}}
   }));
   if(alive){setActivity(old=>({...old,...results}));setCalls(old=>({...old,...callResults}));listener.current?.(callResults);}
   running=false;if(alive&&pending.size)drain();
  }
  function queue(list){list.forEach(id=>pending.add(id));clearTimeout(debounce);debounce=setTimeout(drain,100);}
  function invalidate(payload){
   const id=Number(payload?.idComunidad??payload?.comunidad?.id??payload?.canal?.idComunidad);
   const list=allowed.has(id)?[id]:known;
   list.forEach(key=>versions.set(key,(versions.get(key)??0)+1));
   setActivity(old=>({...old,...Object.fromEntries(list.map(key=>[key,'']))}));
   setCalls(old=>({...old,...Object.fromEntries(list.map(key=>[key,null]))}));queue(list);
  }
  const refresh=()=>{if(document.visibilityState!=='hidden')queue(known);};
  const events=['community:left','community:member-updated','channel:access-lost','channel:updated','channel:deleted','community:activity-changed','connect'];
  events.forEach(e=>socket?.on(e,invalidate));
  const timer=setInterval(refresh,30000);let lastFocus=Date.now();
  const focus=()=>{if(Date.now()-lastFocus>=15000){lastFocus=Date.now();refresh();}};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  known.forEach(id=>pending.add(id));drain();
  return()=>{alive=false;clearTimeout(debounce);clearInterval(timer);events.forEach(e=>socket?.off(e,invalidate));window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[ids,socket]);
 return {activity,activeCalls:calls};
}
