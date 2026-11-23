const shapes = {
  notificacionesSilenciadas: <><path d="M3 3l18 18M6 7a6 6 0 0 0 0 4v5l-2 2h14M10 21h4M10 5a6 6 0 0 1 8 6v3"/></>,
  pin: <><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6zM12 15v6"/></>,
  menu: <><path d="M5 6h14M5 12h14M5 18h14"/></>,
  comunidades: <><rect x="3.5" y="3.5" width="7" height="7" rx="2.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2.2" /><circle cx="17" cy="17" r="3.6" /></>,
  mensajes: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" />,
  amigos: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" /><circle cx="17" cy="9.5" r="2.5" /><path d="M16.5 14.2c2.6.1 4.5 2 4.5 4.6" /></>,
  perfil: <><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.6 8-6.6s8 2.6 8 6.6" /></>,
  enviar: <path d="M5 12h14M12 5l7 7-7 7" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  cerrarSesion: <><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M9.5 8L5.5 12l4 4M5.5 12H15" /></>,
  microfono: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  silenciado: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" /></>,
  camara: <><rect x="3" y="6" width="12" height="12" rx="3" /><path d="M15 10l6-3v10l-6-3" /></>,
  grilla: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  pantalla: <><rect x="3" y="4.5" width="18" height="12" rx="2.5" /><path d="M12 13.5V8.5M9.5 11L12 8.5l2.5 2.5M8 20.5h8" /></>,
  canalVoz: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  canalTexto: <path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />,
  privado: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  publica: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z" /></>,
  ia: <><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  moderacion: <><path d="M12 3.5l7 2.8v5.4c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6.3z" /><path d="M9 12h6" /></>,
  error: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.3v.2" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.7v.2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mas: <path d="M12 5v14M5 12h14" />,
  enlace: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  copiar: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  papelera: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />,
  lapiz: <path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z" />,
  grip: <><circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>,
  corona: <path d="M4 18h16M5 15l-1-8 4.5 3.5L12 5l3.5 5.5L20 7l-1 8z" />,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  correo: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  reintentar: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  subir: <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14" />,
  telefono: <path d="M6.6 3.5h2.8l1.4 3.9-1.9 1.3a11.5 11.5 0 0 0 6.4 6.4l1.3-1.9 3.9 1.4v2.8a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z" />,
  colgar: <path d="M3.2 13.6c4.9-4.3 12.7-4.3 17.6 0l-1.3 2.9-3.5-.9-.4-2.5a9.8 9.8 0 0 0-7.2 0l-.4 2.5-3.5.9z" />,
  puntos: <><circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" /></>,
  pausa: <><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" /></>,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none" />,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></>,
  luna: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  campana: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z" /><path d="M10 20.8a2.3 2.3 0 0 0 4 0" /></>,
};

export default function Icon({ name, size = 20, stroke = 1.9 }) {
  if (name === 'marca') {
    return (
      <svg width={size * 1.5} height={size} viewBox="0 0 220 140" aria-hidden="true">
        <circle cx="80" cy="70" r="60" fill="none" stroke="currentColor" strokeWidth="16" />
        <circle cx="140" cy="70" r="60" fill="none" stroke="currentColor" strokeWidth="16" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}

export function Spinner({ size = 18 }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
