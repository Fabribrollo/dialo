import { Room, RoomEvent, Track } from 'livekit-client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCall } from '../hooks/useCall.js';
import { api } from '../services/api.js';
import CallStage from '../components/calls/CallStage.jsx';

export const PrivateCallContext=createContext(null);
const states={LLAMANDO:'Llamando…',ACEPTADA:'Llamada en curso',RECHAZADA:'Llamada rechazada',CANCELADA:'Llamada cancelada',PERDIDA:'Sin respuesta',FINALIZADA:'Llamada finalizada'};
export function PrivateCallProvider({children}) {
  const socket=useSocket(),{usuario}=useAuth(),channelCall=useCall();
  const [call,setCall]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false),[people,setPeople]=useState([]),[mic,setMic]=useState(true),[camera,setCamera]=useState(false);
  const room=useRef(null),audios=useRef(null),intent=useRef(null),callRef=useRef(null),generation=useRef(0),pending=useRef(false),alive=useRef(true),updates=useRef(0);
  callRef.current=call;
  function release() {
    generation.current++;
    room.current?.removeAllListeners();
    room.current?.disconnect();
    room.current=null;
    audios.current?.replaceChildren();
    setConnected(false);setPeople([]);
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
        const credentials=await api.post(`/private-calls/${call.id}/token`);
        if(seq!==generation.current||!alive.current)return;
        const r=new Room();room.current=r;setMic(true);setCamera(false);
        const refresh=()=>{
          const all=[r.localParticipant,...r.remoteParticipants.values()];
          setPeople(all.map((p)=>({
            idUsuario:p.identity,nombre:p.name||'Participante',local:p===r.localParticipant,hablando:p.isSpeaking,
            microfono:p.isMicrophoneEnabled,video:p.getTrackPublication(Track.Source.Camera)?.track,
          })));
        };
        [RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.ActiveSpeakersChanged].forEach((e)=>r.on(e,refresh));
        r.on(RoomEvent.TrackSubscribed,(track)=>{if(track.kind===Track.Kind.Audio)audios.current?.append(track.attach());});
        r.on(RoomEvent.TrackUnsubscribed,(track)=>track.detach().forEach((el)=>el.remove()));
        r.on(RoomEvent.Disconnected,()=>{
          if(seq!==generation.current)return;
          release();setError('Se interrumpió la conexión de la llamada.');
          api.post(`/private-calls/${call.id}/end`).catch(()=>{});
        });
        await r.connect(credentials.url,credentials.token);
        if(seq!==generation.current){r.disconnect();return;}
        setConnected(true);
        for (const [kind, key] of [['audioinput','audioInput'], ['audiooutput','audioOutput'], ['videoinput','videoInput']]) {
          const selected = usuario.preferencias?.[key];
          if (selected) await r.switchActiveDevice(kind, selected).catch(() => setError('Un dispositivo guardado no está disponible. Revisá tus preferencias.'));
        }
        if(seq!==generation.current)return;
        await r.startAudio().catch(()=>setError('Tocá Activar audio para escuchar.'));
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
  return <PrivateCallContext.Provider value={{start,busy,active,elegirDispositivo:async(kind,id)=>{if(room.current)await room.current.switchActiveDevice(kind,id);}}}>
    {children}
    {(call||error)&&<aside className="private-call-panel" aria-label="Llamada privada">
      {call&&<><h2>{incoming&&call.estado==='LLAMANDO'?'Llamada entrante':states[call.estado]}</h2>
      <p>{incoming?call.emisor.nombreVisible:call.receptor.nombreVisible} · {call.video?'Video':'Voz'}</p></>}
      {error&&<p role="alert">{error}</p>}
      {incoming&&call?.estado==='LLAMANDO'&&<button disabled={busy} onClick={accept}>Aceptar llamada</button>}
      {active&&<button disabled={busy} onClick={end}>{call.estado==='LLAMANDO'?(incoming?'Rechazar':'Cancelar llamada'):'Finalizar llamada'}</button>}
      {connected&&<>
        <button onClick={async()=>{try{await room.current.localParticipant.setMicrophoneEnabled(!mic);setMic(!mic);}catch(e){setError(e.message);}}}>{mic?'Silenciar micrófono':'Activar micrófono'}</button>
        {call.video&&<button onClick={async()=>{try{await room.current.localParticipant.setCameraEnabled(!camera);setCamera(!camera);}catch(e){setError(e.message);}}}>{camera?'Apagar cámara':'Activar cámara'}</button>}
        <button onClick={()=>room.current?.startAudio().catch(()=>setError('El navegador no pudo activar el audio.'))}>Activar audio</button>
        <CallStage personas={people}/>
      </>}
      {call?.estado==='ACEPTADA'&&!connected&&<p role="status">{intent.current===call.id?'Conectando…':'Llamada aceptada en otra pestaña.'}</p>}
      {!active&&<button onClick={()=>{setCall(null);setError('');}}>Cerrar aviso de llamada</button>}
    </aside>}
    <div ref={audios} hidden/>
  </PrivateCallContext.Provider>;
}
export const usePrivateCall=()=>useContext(PrivateCallContext);
