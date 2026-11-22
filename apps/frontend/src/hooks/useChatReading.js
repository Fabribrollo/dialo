import {useCallback,useEffect,useRef,useState} from 'react';
import {distanciaAlFinal,fijarDistanciaAlFinal} from '../utils/chat.js';
export function useChatReading(messages,viewport,stick,ownId){
 const [away,setAway]=useState(false),[firstUnread,setFirstUnread]=useState(null),[count,setCount]=useState(0);
 const known=useRef(null),hadMessages=useRef(false),unread=useRef(new Set());
 useEffect(()=>{
  const ids=new Set(messages.map(m=>m.id));if(!messages.length){known.current=null;hadMessages.current=false;unread.current.clear();setCount(0);setFirstUnread(null);return;}
  if(known.current&&hadMessages.current&&!stick.current){
   const newest=Math.max(0,...known.current);
   const incoming=messages.filter(m=>m.id>newest&&!known.current.has(m.id)&&!m.eliminado&&(m.idAutor??m.autor?.id)!==ownId);
   incoming.forEach(m=>unread.current.add(m.id));
  }
  const visible=messages.filter(m=>unread.current.has(m.id)&&!m.eliminado);unread.current=new Set(visible.map(m=>m.id));setCount(visible.length);setFirstUnread(visible[0]?.id??null);
  known.current=ids;if(messages.length)hadMessages.current=true;
 },[messages,ownId,stick]);
 const onScroll=useCallback(e=>{const near=distanciaAlFinal(e.currentTarget)<90;stick.current=near;setAway(!near);if(near){unread.current.clear();setFirstUnread(null);setCount(0);}},[stick]);
 const toLatest=useCallback(()=>{if(viewport.current)fijarDistanciaAlFinal(viewport.current,0);stick.current=true;unread.current.clear();setAway(false);setFirstUnread(null);setCount(0);},[viewport,stick]);
 return {away,firstUnread,count,onScroll,toLatest};
}
