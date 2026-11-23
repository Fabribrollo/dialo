import {useEffect,useState} from 'react';
import Icon from './ui/Icon.jsx';
import {guardarTema,leerTema,seguirTema,suscribirTema} from '../utils/theme.js';

// Mantiene el tema elegido aplicado mientras la app está abierta.
export function ThemeSync(){useEffect(()=>seguirTema(),[]);return null;}

const opciones=[['claro','Claro','sol'],['oscuro','Oscuro','luna'],['sistema','Como el sistema','pantalla']];

export default function AppearanceSettings(){
 const [tema,setTema]=useState(leerTema);
 useEffect(()=>suscribirTema(setTema),[]);
 return <section className="set-card appearance-settings" aria-labelledby="apariencia-titulo">
  <header className="set-head"><h2 id="apariencia-titulo">Apariencia</h2><p>Se guarda en este navegador.</p></header>
  <div className="theme-options" role="radiogroup" aria-labelledby="apariencia-titulo">
   {opciones.map(([valor,texto,icono])=><button key={valor} type="button" role="radio" aria-checked={tema===valor} className={`theme-option theme-${valor}`} onClick={()=>guardarTema(valor)}>
    <span className="theme-preview" aria-hidden="true"><span/><span/><span/></span>
    <span className="theme-label"><Icon name={icono} size={15} stroke={2}/>{texto}</span>
   </button>)}
  </div>
 </section>;
}
