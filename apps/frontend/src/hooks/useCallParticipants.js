import {useEffect,useState} from 'react';
import {useSocket} from './useSocket.js';import {EVENTS} from '../constants/events.js';
import {channelSubscription} from '../services/channelSubscriptions.js';import {getCallParticipants} from '../services/callsService.js';
export function useCallParticipants(idCanal){
 const socket=useSocket();const [items,setItems]=useState([]),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true,revision=0,loading=false,queued=false;
  setItems([]);setError('');
  const load=async()=>{if(!alive)return;if(loading){queued=true;return;}loading=true;const current=revision;
   try{const data=await getCallParticipants(idCanal);if(alive&&current===revision){setItems(data.items);setError('');}}catch(e){if(alive&&current===revision)setError(e.message);}finally{loading=false;if(queued&&alive){queued=false;load();}}
  };
  const subscribe=async()=>{try{if(socket?.connected)await channelSubscription(socket,EVENTS.CHANNEL_SUBSCRIBE,idCanal);}catch(e){if(alive)setError(e.message);}if(alive)load();};
  const joined=({idCanal:id,participante})=>{if(id!==idCanal||!alive)return;revision++;setItems(old=>[...old.filter(p=>p.usuario.id!==participante.usuario.id),participante]);};
  const left=({idCanal:id,idUsuario})=>{if(id!==idCanal||!alive)return;revision++;setItems(old=>old.filter(p=>p.usuario.id!==idUsuario));};
  const activity=()=>load();const focus=()=>{if(document.visibilityState!=='hidden')load();};
  socket?.on(EVENTS.CALL_PARTICIPANT_JOINED,joined);socket?.on(EVENTS.CALL_PARTICIPANT_LEFT,left);socket?.on('connect',subscribe);socket?.on('community:activity-changed',activity);
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);const timer=setInterval(focus,5000);subscribe();
  return()=>{alive=false;clearInterval(timer);socket?.off(EVENTS.CALL_PARTICIPANT_JOINED,joined);socket?.off(EVENTS.CALL_PARTICIPANT_LEFT,left);socket?.off('connect',subscribe);socket?.off('community:activity-changed',activity);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);if(socket?.connected)channelSubscription(socket,EVENTS.CHANNEL_UNSUBSCRIBE,idCanal).catch(()=>{});};
 },[socket,idCanal]);return {items,error};
}
