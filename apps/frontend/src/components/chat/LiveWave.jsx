import {useEffect,useRef} from 'react';

const BARRAS=56;
// Onda en vivo del micrófono: cada barra es el volumen de un instante y la serie avanza hacia la izquierda.
export default function LiveWave({stream,active}){
 const root=useRef(null),levels=useRef(Array(BARRAS).fill(0));
 useEffect(()=>{
  const el=root.current;if(!el)return undefined;
  const bars=[...el.children];
  const paint=()=>bars.forEach((b,i)=>{b.style.transform=`scaleY(${Math.max(.12,levels.current[i])})`;});
  paint();
  if(!stream||!active||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return undefined;
  let ctx,raf=0,last=0;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{return undefined;}
  const analyser=ctx.createAnalyser();analyser.fftSize=512;
  const source=ctx.createMediaStreamSource(stream);source.connect(analyser);
  const data=new Uint8Array(analyser.fftSize);
  const tick=t=>{
   raf=requestAnimationFrame(tick);
   if(t-last<70)return;last=t;
   analyser.getByteTimeDomainData(data);
   let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x;}
   const level=Math.min(1,Math.sqrt(sum/data.length)*4.2);
   levels.current=[...levels.current.slice(1),level];paint();
  };
  raf=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(raf);source.disconnect();ctx.close?.().catch(()=>{});};
 },[stream,active]);
 return <span className={`record-wave ${active?'is-live':''}`} ref={root} aria-hidden="true">{Array.from({length:BARRAS},(_,i)=><i key={i}/>)}</span>;
}
