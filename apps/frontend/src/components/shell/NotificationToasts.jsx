import {avisar,cerrarAviso} from './systemToastsStore.js';
import { formatListTime } from '../../utils/chat.js';
import { useEffect, useRef } from 'react';
// Iniciales de la comunidad sin contar «de», «la», «y»…: Taller de Redes → TR.
export const siglas = (nombre) => (nombre.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('') || nombre.slice(0, 2)).toUpperCase();
const ORIGEN = { conversacion: 'mensajes', canal: 'canalTexto', amistad: 'perfil', solicitud_canal:'privado', acceso_aceptado:'privado', acceso_rechazado:'privado', roles: 'ajustes', acceso: 'ajustes', baneo: 'ajustes', rehabilitado: 'ajustes' };

export function haceCuanto(fecha, ahora = Date.now()) {
  const min = Math.floor((ahora - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  return formatListTime(fecha);
}

// Lo que dice cada aviso flotante, según el diseño de notificaciones.
export function contenidoDelAviso(g) {
  const c = g.contexto ?? {};
  const vista = g.vista;
  if(g.distincion)return {titulo:g.distincion==='mencion'?'Te mencionaron':'Respondieron tu mensaje',texto:vista?.texto??'',nombre:c.nombre,canal:g.tipo==='canal',principal:'Ver mensaje',secundaria:'Marcar como leído'};
  const seguridad = {
    solicitud_canal: ['Solicitud de acceso', c.nombre?`Hay un pedido para #${c.nombre}.`:'Hay un pedido para revisar.'],
    acceso_aceptado: ['Acceso aprobado', c.nombre?`Ya podés entrar a #${c.nombre}.`:'Se aprobó tu solicitud de acceso.'],
    acceso_rechazado: ['Solicitud rechazada', 'Administración no aprobó tu pedido de acceso.'],
    roles: ['Tus roles cambiaron', c.nombre ? `Se actualizaron tus roles en ${c.nombre}.` : 'Se actualizaron tus roles en una comunidad.'],
    acceso: ['Tu acceso cambió', c.nombre ? `Se actualizaron tus permisos en #${c.nombre}.` : 'Se restringió tu acceso a un canal.'],
    baneo: ['Acceso restringido', 'Ya no tenés acceso a una comunidad.'],
    rehabilitado: ['Restricción levantada', 'Podés volver a solicitar ingresar. Tu membresía no se restauró.'],
  }[g.tipo];
  if (seguridad) return {
    titulo: seguridad[0], texto: seguridad[1], nombre: 'Dialo', canal: true,
    principal: c.idComunidad ? 'Ver cambios' : 'Entendido', secundaria: 'Marcar como leído',
  };
  if (g.tipo === 'amistad') {
    return { titulo: `${c.nombre ?? 'Alguien'} te mandó una solicitud`, texto: '', nombre: c.nombre, foto: c.fotoUrl, principal: 'Aceptar', secundaria: 'Rechazar' };
  }
  if (g.tipo === 'canal') {
    const varios = g.nuevas > 1;
    return {
      titulo: varios ? (c.comunidad ?? `#${c.nombre}`) : `${vista?.autor ?? 'Alguien'} en #${c.nombre ?? 'canal'}`,
      texto: vista?.texto ? (varios ? `${vista.autor}: ${vista.texto}` : vista.texto) : '',
      nombre: c.comunidad ?? c.nombre, canal: true,
      principal: varios ? `Ver los ${g.nuevas}` : 'Ver mensaje', secundaria: 'Marcar como leído',
    };
  }
  return {
    titulo: c.nombre ?? 'Mensaje privado',
    texto: vista?.texto ?? (g.nuevas > 1 ? `${g.nuevas} mensajes nuevos` : ''),
    nombre: c.nombre, foto: c.fotoUrl, principal: 'Responder', secundaria: 'Marcar como leído',
  };
}

export default function NotificationToasts({avisos,onPrincipal,onSecundaria,onCerrar}){
 const callbacks=useRef({onPrincipal,onSecundaria,onCerrar});callbacks.current={onPrincipal,onSecundaria,onCerrar};const current=useRef(new Map());
 useEffect(()=>{
  const next=new Map(avisos.map(a=>[a.key,`${a.nuevas}:${a.fecha}`]));
  for(const [key] of current.current)if(!next.has(key))cerrarAviso(`actividad:${key}`);
  for(const a of avisos)if(current.current.get(a.key)!==next.get(a.key)){
   const content=contenidoDelAviso(a);
   avisar({id:`actividad:${a.key}`,tipo:'info',titulo:content.titulo,texto:content.texto,foto:content.foto,nombre:content.nombre,siglas:content.canal?siglas(content.nombre??'#'):undefined,origen:ORIGEN[a.tipo],fecha:a.fecha,duracion:7000,onDismiss:()=>callbacks.current.onCerrar(a.key),acciones:[{label:content.principal,principal:true,fn:()=>callbacks.current.onPrincipal(a)},{label:content.secundaria,fn:()=>callbacks.current.onSecundaria(a)}]});
  }
  current.current=next;
 },[avisos]);
 useEffect(()=>()=>{for(const key of current.current.keys())cerrarAviso(`actividad:${key}`);},[]);
 return null;
}
