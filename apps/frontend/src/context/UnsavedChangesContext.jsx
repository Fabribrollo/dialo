import {createContext,useContext,useEffect,useId,useRef,useState} from 'react';
import {UNSAFE_DataRouterContext,useBlocker,useNavigate} from 'react-router';
import {ConfirmDialog} from '../components/ui/Dialog.jsx';
const Context=createContext(null);
function NavigationGuard({guards,clear}){
 const blocker=useBlocker(({currentLocation,nextLocation})=>guards.current.size>0&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search));
 return <ConfirmDialog open={blocker.state==='blocked'} title="¿Descartar los cambios sin guardar?" confirmLabel="Descartar y salir" onCancel={()=>blocker.reset?.()} onConfirm={()=>{clear();blocker.proceed?.();}}>Los cambios del formulario no se guardarán.</ConfirmDialog>;
}
export function UnsavedChangesProvider({children}){
 const dataRouter=useContext(UNSAFE_DataRouterContext),navigate=useNavigate();
 const guards=useRef(new Map()),[pending,setPending]=useState(null);
 const clear=()=>guards.current.clear();
 function run(action){if(guards.current.size)setPending(()=>action);else action?.();}
 useEffect(()=>{
  const unload=e=>{if(guards.current.size){e.preventDefault();e.returnValue='';}};
  const links=e=>{if(dataRouter||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=e.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname===location.pathname&&u.search===location.search)return;if(guards.current.size){e.preventDefault();e.stopPropagation();run(()=>navigate(u.pathname+u.search+u.hash));}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',links,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',links,true);};
 },[dataRouter,navigate]);
 return <Context.Provider value={{run,register:(key,label)=>guards.current.set(key,label),remove:key=>guards.current.delete(key)}}>{children}{dataRouter&&<NavigationGuard guards={guards} clear={clear}/>}<ConfirmDialog open={Boolean(pending)} title="¿Descartar los cambios sin guardar?" confirmLabel="Descartar y continuar" onCancel={()=>setPending(null)} onConfirm={()=>{const action=pending;clear();setPending(null);action?.();}}>Podés quedarte para guardar o continuar y descartar los cambios.</ConfirmDialog></Context.Provider>;
}
export function useUnsavedChanges(dirty,label='Formulario',signature=''){
 const context=useContext(Context),key=useId(),saved=useRef(null);
 useEffect(()=>{if(dirty&&saved.current!==signature)context?.register(key,label);else context?.remove(key);return()=>context?.remove(key);},[dirty,label,signature,key]);
 return {markSaved:()=>{saved.current=signature;context?.remove(key);},guard:action=>context?context.run(action):action?.()};
}
export const useGuardedAction=()=>useContext(Context)?.run??(action=>action?.());
