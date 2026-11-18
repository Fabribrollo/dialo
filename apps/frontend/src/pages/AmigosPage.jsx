import { useState } from 'react';
import { AmigosLista } from '../components/friends/AmigosLista.jsx';
import { BuscadorUsuarios } from '../components/friends/BuscadorUsuarios.jsx';
import { SolicitudesEnviadas, SolicitudesRecibidas } from '../components/friends/SolicitudesListas.jsx';
import Segmented from '../components/ui/Segmented.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Spinner } from '../components/ui/Icon.jsx';
import { useFriends } from '../hooks/useFriends.js';
import '../styles/friends.css';

export default function AmigosPage() {
  const friends = useFriends();
  const [tab, setTab] = useState('amigos');
  const pendientes = friends.recibidas.length;
  const tabs = [
    { value: 'amigos', label: 'Mis amigos' },
    { value: 'solicitudes', label: <>Solicitudes{pendientes > 0 && <span className="seg-count">{pendientes}</span>}</> },
    { value: 'buscar', label: 'Buscar personas' },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="dsp">Amigos</h1>
      </header>
      <div className="page-tabs">
        <Segmented dark className="fr-tabs" options={tabs} value={tab} onChange={setTab} label="Secciones de amigos" />
      </div>
      <div className="page-body">
        {friends.estado === 'cargando' && <span className="fr-note" role="status"><Spinner size={15} />Cargando amigos…</span>}
        {friends.estado === 'error' && <Notice tone="error" title={friends.error} actionLabel="Reintentar" onAction={friends.recargar} />}
        {friends.estado === 'listo' && tab === 'amigos' && <AmigosLista friends={friends} />}
        {friends.estado === 'listo' && tab === 'solicitudes' && (
          <>
            <h2 className="page-h2">Recibidas</h2>
            <SolicitudesRecibidas friends={friends} />
            <h2 className="page-h2 page-h2-gap">Enviadas</h2>
            <SolicitudesEnviadas friends={friends} />
          </>
        )}
        {tab === 'buscar' && <BuscadorUsuarios friends={friends} />}
      </div>
    </div>
  );
}
