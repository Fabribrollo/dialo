import { useEffect, useRef } from 'react';

function VideoTile({ track, nombre, local, hablando, pantalla }) {
  const ref = useRef(null);
  useEffect(() => {
    const elemento = ref.current;
    if (!track || !elemento) return undefined;
    track.attach(elemento);
    return () => { track.detach(elemento); };
  }, [track]);
  const clases = ['call-video-tile', hablando && 'is-speaking', local && !pantalla && 'is-local', pantalla && 'is-screen'].filter(Boolean).join(' ');
  return <figure className={clases}>
    {track ? <video ref={ref} autoPlay playsInline muted aria-label={`${pantalla ? 'Pantalla' : 'Cámara'} de ${nombre}`} />
      : <div className="call-video-off" aria-hidden="true">{(nombre ?? '?').slice(0, 2).toUpperCase()}</div>}
    <figcaption>{pantalla && 'Pantalla de '}{nombre}{local && ' (vos)'}{!track && ' · sin cámara'}</figcaption>
  </figure>;
}

export default function VideoGrid({ participantes }) {
  const pantallas = participantes.filter((p) => p.videoPantalla);
  return <div className="call-video-grid" aria-label="Video de la llamada" role="group">
    {pantallas.map((p) => <VideoTile key={`pantalla-${p.idUsuario}`} track={p.videoPantalla} nombre={p.nombre} local={p.local} pantalla />)}
    {participantes.map((p) => <VideoTile key={`camara-${p.idUsuario}`} track={p.video} nombre={p.nombre} local={p.local} hablando={p.hablando} />)}
  </div>;
}
