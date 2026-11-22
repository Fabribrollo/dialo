import {useChatStates} from './ChatStateContext.jsx';
import {avisar,cerrarAviso} from '../components/shell/systemToastsStore.js';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCall } from '../hooks/useCall.js';
import { api } from '../services/api.js';

export const PrivateCallContext=createContext(null);
const states={LLAMANDO:'Llamando…',ACEPTADA:'Llamada en curso',RECHAZADA:'Llamada rechazada',CANCELADA:'Llamada cancelada',PERDIDA:'Sin respuesta',FINALIZADA:'Llamada finalizada'};
export function PrivateCallProvider({children}) {
  const chatStates=useChatStates();
  const socket=useSocket(),{usuario}=useAuth(),channelCall=useCall();
  const [chatVisible,setChatVisible]=useState(false);
  const [desde,setDesde]=useState(null),[audioBlocked,setAudioBlocked]=useState(false);
  const [call,setCall]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false),[people,setPeople]=useState([]),[mic,setMic]=useState(true),[camera,setCamera]=useState(false),[screen,setScreen]=useState(false);
  useEffect(()=>setChatVisible(false),[call?.id]);
  const room=useRef(null),audios=useRef(null),intent=useRef(null),callRef=useRef(null),generation=useRef(0),pending=useRef(false),syncPeople=useRef(()=>{}),alive=useRef(true),updates=useRef(0);
  callRef.current=call;
  function release() {
    generation.current++;
    room.current?.removeAllListeners();
    room.current?.disconnect();
    room.current=null;
    audios.current?.replaceChildren();
    syncPeople.current=()=>{};setScreen(false);setConnected(false);setPeople([]);setDesde(null);setAudioBlocked(false);
  }
  useEffect(()=>{
    alive.current=true;
    const receive=({llamada})=>{
      if(!alive.current)return;
      updates.current++;setCall(llamada);
      if(!['LLAMANDO','ACEPTADA'].includes(llamada.estado)){intent.current=null;release();}
    };
    async function recover(){
      const version=updates.current;
      try {
        const r=await api.get('/private-calls/current');
        if(!alive.current||version!==updates.current)return;
        if(r.llamada)setCall(r.llamada);
        else if(callRef.current&&['LLAMANDO','ACEPTADA'].includes(callRef.current.estado)){
          release();setCall((c)=>c?{...c,estado:'FINALIZADA'}:null);
        }
      }catch{}
    }
    recover();socket?.on('private-call:changed',receive);socket?.on('connect',recover);
    const timer=setInterval(recover,10000);
    return ()=>{
      alive.current=false;clearInterval(timer);socket?.off('private-call:changed',receive);socket?.off('connect',recover);
      const c=callRef.current;
      release();
      if(intent.current&&c&&['LLAMANDO','ACEPTADA'].includes(c.estado))api.post(`/private-calls/${c.id}/end`).catch(()=>{});
    };
  },[socket]);
  useEffect(()=>{
    if(call?.estado!=='ACEPTADA'||intent.current!==call.id||room.current)return;
    const seq=++generation.current;
    async function connect(){
      try{
        const {Room,RoomEvent,Track}=await import('livekit-client');
        if(seq!==generation.current||!alive.current)return;
        const credentials=await api.post(`/private-calls/${call.id}/token`);
        if(seq!==generation.current||!alive.current)return;
        const r=new Room();room.current=r;syncPeople.current=()=>{};setMic(true);setCamera(false);
        const refresh=()=>{
          if(seq!==generation.current||!alive.current)return;
          const all=[r.localParticipant,...r.remoteParticipants.values()];
          setPeople(all.map((p)=>({
            idUsuario:p.identity,nombre:p.name||'Participante',local:p===r.localParticipant,hablando:p.isSpeaking,
            microfono:p.isMicrophoneEnabled,video:p.isCameraEnabled?p.getTrackPublication(Track.Source.Camera)?.track??null:null,
            pantalla:Boolean(p.isScreenShareEnabled),videoPantalla:p.isScreenShareEnabled?p.getTrackPublication(Track.Source.ScreenShare)?.track??null:null,
          })));
          setScreen(Boolean(r.localParticipant.isScreenShareEnabled));
        };
        syncPeople.current=refresh;
        [RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.ActiveSpeakersChanged].forEach((e)=>r.on(e,refresh));
        r.on(RoomEvent.TrackSubscribed,(track)=>{if(track.kind===Track.Kind.Audio)audios.current?.append(track.attach());});
        r.on(RoomEvent.TrackUnsubscribed,(track)=>track.detach().forEach((el)=>el.remove()));
        r.on(RoomEvent.Disconnected,()=>{
          if(seq!==generation.current)return;
          release();setError('Se interrumpió la conexión de la llamada.');
          api.post(`/private-calls/${call.id}/end`).catch(()=>{});
        });
        await r.connect(credentials.url,credentials.token);
        if(seq!==generation.current){r.disconnect();return;}
        setConnected(true);setDesde(Date.now());
        for (const [kind, key] of [['audioinput','audioInput'], ['audiooutput','audioOutput'], ['videoinput','videoInput']]) {
          const selected = usuario.preferencias?.[key];
          if (selected) await r.switchActiveDevice(kind, selected).catch(() => setError('Un dispositivo guardado no está disponible. Revisá tus preferencias.'));
        }
        if(seq!==generation.current)return;
        await r.startAudio().catch(()=>{setAudioBlocked(true);setError('Tocá Activar audio para escuchar.');});
        if(seq!==generation.current)return;
        try{await r.localParticipant.setMicrophoneEnabled(true);}catch{setError('No se pudo activar el micrófono. Podés escuchar y volver a intentarlo.');setMic(false);}
        if(seq!==generation.current)return;
        if(call.video){try{await r.localParticipant.setCameraEnabled(true);setCamera(true);}catch{setError('No se pudo activar la cámara. El audio sigue disponible.');}}
        refresh();
      }catch(e){
        if(seq!==generation.current||!alive.current)return;
        release();setError(e.message||'No se pudo conectar la llamada');
        api.post(`/private-calls/${call.id}/end`).catch(()=>{});
      }
    }
    connect();
  },[call?.id,call?.estado]);
  async function operation(fn){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{return await fn();}catch(e){setError(e.code==='CALL_BUSY'?'La persona está ocupada o ya tenés otra llamada.':e.message);}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  function start(idConversacion,video=false){
    return operation(async()=>{
      if(channelCall?.canal&&['CONECTADO','CONECTANDO','RECONECTANDO'].includes(channelCall.estado))throw new Error('Salí primero de la llamada del canal.');
      const r=await api.post('/private-calls',{idConversacion,video});
      intent.current=r.llamada.id;setCall(r.llamada);
    });
  }
  function accept(){return operation(async()=>{
    if(channelCall?.canal&&['CONECTADO','CONECTANDO','RECONECTANDO'].includes(channelCall.estado))throw new Error('Salí primero de la llamada del canal.');
    intent.current=call.id;
    try {const r=await api.post(`/private-calls/${call.id}/accept`);setCall((c)=>c?.id===r.llamada.id&&!['LLAMANDO','ACEPTADA'].includes(c.estado)?c:r.llamada);}
    catch(e){intent.current=null;throw e;}
  });}
  function end(){return operation(async()=>{
    const id=call.id, ended = call.estado === 'LLAMANDO' ? (call.idReceptor === usuario.id ? 'RECHAZADA' : 'CANCELADA') : 'FINALIZADA';intent.current=null;release();
    await api.post(`/private-calls/${id}/end`);setCall((c)=>c?.id===id?{...c,estado:ended}:c);
  });}
  const active=call&&['LLAMANDO','ACEPTADA'].includes(call.estado),incoming=call?.idReceptor===usuario.id;
  const ringing=Boolean(incoming&&call?.estado==='LLAMANDO');
  // Tono de llamada entrante; se calla al atender, rechazar o si silenciaste los avisos.
  useEffect(()=>{
    if(!ringing||chatStates.loading||chatStates.get('conversacion',call?.idConversacion).archivado||chatStates.get('conversacion',call?.idConversacion).silenciado||usuario.preferencias?.silenciarNotificaciones)return undefined;
    let ctx;
    try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{return undefined;}
    const tone=()=>{
      const t=ctx.currentTime;
      for(const f of [440,480]){
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.05);g.gain.setValueAtTime(.05,t+.9);g.gain.linearRampToValueAtTime(0,t+1);
        o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+1.05);
      }
    };
    ctx.resume?.().catch(()=>{});tone();
    const id=setInterval(tone,3000);
    return ()=>{clearInterval(id);ctx.close?.().catch(()=>{});};
  },[ringing,usuario.preferencias?.silenciarNotificaciones,chatStates.items,chatStates.loading]);
  const canShare=typeof navigator!=='undefined'&&Boolean(navigator.mediaDevices?.getDisplayMedia);
  async function toggleScreen(){
    try{const r=room.current;if(!r||!connected)return;await r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled);syncPeople.current();}
    catch(e){if(e?.name!=='NotAllowedError')setError('No se pudo compartir la pantalla.');}
  }
  const other=call&&(incoming?call.emisor:call.receptor);
  const adapter={estado:connected?'CONECTADO':'CONECTANDO',audioBloqueado:audioBlocked,activarAudio:async()=>{try{await room.current?.startAudio();setAudioBlocked(false);}catch{setError('No se pudo habilitar el audio. Volvé a intentar.');}},microfono:mic,camara:camera,pantalla:screen,
    alternarMicrofono:async()=>{try{await room.current?.localParticipant.setMicrophoneEnabled(!mic);setMic(!mic);}catch(e){setError(e.message);}},
    alternarCamara:async()=>{try{await room.current?.localParticipant.setCameraEnabled(!camera);setCamera(!camera);syncPeople.current();}catch(e){setError(e.message);}},alternarPantalla:toggleScreen};
  const actionRef=useRef({accept,end});actionRef.current={accept,end};
  useEffect(()=>{
    if(!ringing||chatStates.loading||chatStates.get('conversacion',call?.idConversacion).archivado||chatStates.get('conversacion',call?.idConversacion).silenciado||usuario.preferencias?.silenciarNotificaciones)return;
    avisar({id:'llamada-privada-entrante',tipo:'llamada',titulo:'Llamada entrante',texto:`${other?.nombreVisible??'Contacto'} · ${call.video?'Video':'Voz'}`,foto:other?.fotoUrl,nombre:other?.nombreVisible,duracion:0,acciones:[{label:'Rechazar',fn:()=>actionRef.current.end()},{label:'Aceptar llamada',fn:()=>actionRef.current.accept()}],onDismiss:()=>actionRef.current.end()});
    return()=>cerrarAviso('llamada-privada-entrante');
  },[ringing,call?.id,busy,chatStates.items,chatStates.loading,usuario.preferencias?.silenciarNotificaciones]);
  useEffect(()=>{if(error)avisar({id:'llamada-privada-error',tipo:'error',titulo:'Llamada privada',texto:error});},[error]);
  useEffect(()=>{if(call&&!active)avisar({id:`llamada-privada-${call.id}`,titulo:states[call.estado],texto:other?.nombreVisible??''});},[call?.id,call?.estado]);
  return <PrivateCallContext.Provider value={{chatVisible,showChat:()=>setChatVisible(true),showCall:()=>setChatVisible(false),start,busy,active,call,other,acceptedElsewhere:call?.estado==='ACEPTADA'&&intent.current!==call.id,connected,people,adapter,canShare,end,accept,incoming,desde,elegirDispositivo:async(kind,id)=>{if(room.current)await room.current.switchActiveDevice(kind,id);}}}>
    {children}<div ref={audios} hidden/>
  </PrivateCallContext.Provider>;
}
export const usePrivateCall=()=>useContext(PrivateCallContext);
