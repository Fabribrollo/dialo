import './skeleton.css';

// Bloque gris con brillo que ocupa el lugar del contenido mientras carga.
export default function Skeleton({ width = '100%', height = 12, radius = 8, className = '', style }) {
  return <span className={`skel ${className}`} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

// Filas tipo lista (avatar + dos líneas). `label` se anuncia una sola vez a lectores de pantalla.
export function SkeletonRows({ rows = 3, avatar = 40, square = false, label = 'Cargando…', action = false, className = '' }) {
  const anchos = ['62%', '48%', '70%', '55%', '66%'];
  return (
    <div className={`skel-rows ${className}`} role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i} style={{ '--skel-delay': `${i * 90}ms` }}>
          {avatar > 0 && <Skeleton width={avatar} height={avatar} radius={square ? Math.round(avatar * .3) : '50%'} />}
          <span className="skel-lines">
            <Skeleton width={anchos[i % anchos.length]} height={12} />
            <Skeleton width={`calc(${anchos[(i + 2) % anchos.length]} - 18%)`} height={10} />
          </span>
          {action && <Skeleton width={92} height={32} radius={16} />}
        </div>
      ))}
    </div>
  );
}

// Globos de chat alternados para la carga de una conversación o canal.
export function SkeletonMessages({ count = 6, label = 'Cargando mensajes…' }) {
  const anchos = [46, 64, 32, 58, 40, 70, 36];
  return (
    <div className="skel-msgs" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skel-msg ${i % 3 === 1 ? 'skel-msg-own' : ''}`} style={{ '--skel-delay': `${i * 70}ms` }}>
          <Skeleton width={`${anchos[i % anchos.length]}%`} height={i % 4 === 3 ? 58 : 38} radius={18} />
        </div>
      ))}
    </div>
  );
}
