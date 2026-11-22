import {createContext,useContext,useEffect,useState} from 'react';
const Context=createContext(null);
export function CallOriginProvider({children}){const [origin,setOrigin]=useState(null);return <Context.Provider value={{origin,setOrigin}}>{children}</Context.Provider>;}
export const useCallOrigin=()=>useContext(Context);
export function useCallScene(path,visible){const context=useCallOrigin(),setOrigin=context?.setOrigin;useEffect(()=>{if(!visible||!setOrigin)return;setOrigin(path);return()=>setOrigin(current=>current===path?null:current);},[path,visible,setOrigin]);}
