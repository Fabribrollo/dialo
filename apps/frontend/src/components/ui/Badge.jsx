import Icon from './Icon.jsx';
import './badge.css';

const kinds = {
  texto: { icon: 'canalTexto', label: 'Texto', size: 14, stroke: 2.2 },
  voz: { icon: 'canalVoz', label: 'Voz', size: 15, stroke: 2.1 },
  privado: { icon: 'privado', label: 'Privado', size: 14, stroke: 2.1 },
  publica: { icon: 'publica', label: 'Pública', size: 14, stroke: 2 },
  conCamara: { icon: 'camara', label: 'Con cámara', size: 15, stroke: 2, tone: 'suave' },
  silenciado: { icon: 'silenciado', label: 'Silenciado', size: 14, stroke: 2.1, tone: 'suave' },
  comparte: { icon: 'pantalla', label: 'Comparte pantalla', size: 15, stroke: 2, tone: 'oscuro' },
  pendiente: { label: 'Pendiente' },
  amigos: { icon: 'check', label: 'Amigos', size: 13, stroke: 2.6, tone: 'acento' },
};

export default function Badge({ kind }) {
  const { icon, label, size, stroke, tone = 'base' } = kinds[kind];
  return (
    <span className={`bdg bdg-${tone}`}>
      {icon && <Icon name={icon} size={size} stroke={stroke} />}
      {label}
    </span>
  );
}
