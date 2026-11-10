import { useEffect, useRef } from 'react';

function VideoTile({ participante }) {
  const ref = useRef(null);
  const { video, nombre, local, hablando } = participante;
  useEffect(() => {
    const elemento = ref.current;
    if (!video || !elemento) return undefined;
    video.attach(elemento);
    return () => { video.detach(elemento); };
  }, [video]);
  return <figure className={`call-video-tile${hablando ? ' is-speaking' : ''}${local ? ' is-local' : ''}`}>
    {video ? <video ref={ref} autoPlay playsInline muted aria-label={`Cámara de ${nombre}`} />
      : <div className="call-video-off" aria-hidden="true">{(nombre ?? '?').slice(0, 2).toUpperCase()}</div>}
    <figcaption>{nombre}{local && ' (vos)'}{!video && ' · sin cámara'}</figcaption>
  </figure>;
}

export default function VideoGrid({ participantes }) {
  return <div className="call-video-grid" aria-label="Video de la llamada" role="group">
    {participantes.map((p) => <VideoTile key={p.idUsuario} participante={p} />)}
  </div>;
}
