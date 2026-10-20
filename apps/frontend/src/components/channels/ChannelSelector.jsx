export default function ChannelSelector({ selected, children }) {
  return <details key={selected ?? 'list'} className="channel-selector" open={selected ? undefined : true}>
    <summary>{selected ? 'Cambiar canal' : 'Canales de la comunidad'}</summary>
    {children}
  </details>;
}
