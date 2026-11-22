import {useEffect} from 'react';
export function ThemeSync(){useEffect(()=>{document.documentElement.dataset.theme='claro';},[]);return null;}
export default function AppearanceSettings(){return <section className="device-settings" aria-label="Apariencia"><h2>Apariencia</h2><button type="button" role="switch" aria-checked={false} disabled className="setting-toggle"><span><strong>Modo oscuro</strong><small>Próximamente. Estamos preparando este tema.</small></span><span aria-hidden="true" className="act-toggle"/></button></section>;}
