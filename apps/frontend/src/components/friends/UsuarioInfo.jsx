const DISPONIBILIDAD = {
  EN_LINEA: "En línea",
  AUSENTE: "Ausente",
  NO_MOLESTAR: "No molestar",
  INVISIBLE: "Invisible",
};

// Foto, nombre visible, nombre de usuario y estado de una persona.
export function UsuarioInfo({ usuario }) {
  return (
    <span>
      {usuario.fotoUrl && (
        <img src={usuario.fotoUrl} alt="" width={32} height={32} />
      )}
      <strong>{usuario.nombreVisible}</strong>{" "}
      <small>@{usuario.nombreUsuario}</small>{" "}
      <small>· {DISPONIBILIDAD[usuario.disponibilidad]}</small>
    </span>
  );
}
