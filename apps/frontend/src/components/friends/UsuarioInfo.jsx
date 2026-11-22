import Avatar from '../ui/Avatar.jsx';
import { RowText } from '../ui/Card.jsx';

export function UsuarioInfo({ usuario, presencia = false, children }) {
  return (
    <>
      <Avatar idUsuario={usuario.id} nombre={usuario.nombreVisible} foto={usuario.fotoUrl} color={usuario.colorAvatar} size={44} presence={presencia ? usuario.disponibilidad : undefined} />
      <RowText title={usuario.nombreVisible}>{children ?? `@${usuario.nombreUsuario}`}</RowText>
    </>
  );
}
