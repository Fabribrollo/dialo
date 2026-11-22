import {useEffect,useId,useRef} from 'react';
import {avisar,cerrarAviso} from '../shell/systemToastsStore.js';
function text(value){if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(text).join(' ');return value?.props?.children?text(value.props.children):'';}
export default function Notice({tone='error',title,children,actionLabel,onAction}){
 const key=useId(),action=useRef(onAction);action.current=onAction;const body=text(children),heading=text(title);
 useEffect(()=>{if(!heading&&!body)return;avisar({id:`notice:${key}`,tipo:tone==='error'?'error':tone==='exito'?'ok':'info',titulo:heading,texto:body,duracion:actionLabel?0:7000,accion:actionLabel?{label:actionLabel,fn:()=>action.current?.()}:undefined});return()=>{if(tone!=='exito')cerrarAviso(`notice:${key}`);};},[key,tone,heading,body,actionLabel]);
 return null;
}
