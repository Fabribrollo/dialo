export const KEY='dialo:avisos-navegador';
export const supported=()=>typeof window!=='undefined'&&'Notification' in window;
export function enabled(){try{return localStorage.getItem(KEY)==='1'&&supported()&&Notification.permission==='granted';}catch{return false;}}
export function setEnabled(value){try{localStorage.setItem(KEY,value?'1':'0');}catch{}window.dispatchEvent(new Event('dialo:notification-preference'));}
