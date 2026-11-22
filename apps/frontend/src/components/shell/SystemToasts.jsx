import {useEffect} from 'react';
import {useNavigate} from 'react-router';
import {useSocket} from '../../hooks/useSocket.js';
import {avisar,cerrarAviso,leerAvisos} from './systemToastsStore.js';
import ToastHost from './ToastHost.jsx';
export default function SystemToasts(){
 const socket=useSocket(),navigate=useNavigate();
 useEffect(()=>()=>{for(const a of leerAvisos())cerrarAviso(a.key);},[]);
 useEffect(()=>{if(!socket)return;let fallen=false;const down=()=>{fallen=true;avisar({id:'conexion',tipo:'cargando',texto:'Reconectando…'});};const up=()=>{if(fallen){fallen=false;avisar({id:'conexion',texto:'Conectado de nuevo'});}};socket.on('disconnect',down);socket.on('connect',up);return()=>{socket.off('disconnect',down);socket.off('connect',up);cerrarAviso('conexion');};},[socket]);
 useEffect(()=>{if(!navigator.serviceWorker)return;const open=e=>{const path=e.data?.url;if(e.data?.type==='dialo:open-notification'&&typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!/[\\\u0000-\u0020]/.test(path))navigate(path);};navigator.serviceWorker.addEventListener('message',open);return()=>navigator.serviceWorker.removeEventListener('message',open);},[navigate]);
 return <ToastHost navigate={navigate}/>;
}
