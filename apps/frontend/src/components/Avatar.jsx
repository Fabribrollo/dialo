export const statusNames = {
  EN_LINEA: "En línea",
  AUSENTE: "Ausente",
  NO_MOLESTAR: "No molestar",
  INVISIBLE: "Invisible",
};
export default function Avatar({ usuario, size = "" }) {
  return (
    <span className={`user-avatar ${size}`} aria-hidden="true">
      {usuario.fotoUrl ? (
        <img src={usuario.fotoUrl} alt="" />
      ) : (
        (usuario.nombreVisible || usuario.nombreUsuario || "?")
          .slice(0, 2)
          .toUpperCase()
      )}
      <i className={`presence ${usuario.disponibilidad?.toLowerCase()}`} />
    </span>
  );
}
