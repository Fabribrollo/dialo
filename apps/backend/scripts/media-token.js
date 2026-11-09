// Prueba manual de conectividad: genera un token para entrar a la sala de un canal
// desde https://meet.livekit.io (pestana Custom). No valida permisos: solo para desarrollo.
import { media } from '../src/services/mediaService.js';

const [idUsuario, idCanal] = process.argv.slice(2).map(Number);
if (!idUsuario || !idCanal) {
  console.error('Uso: npm run media:token -w apps/backend -- <idUsuario> <idCanal>');
  process.exit(1);
}
const { url, sala, token, expiraEn } = await media.crearToken({
  idUsuario, nombre: `Prueba ${idUsuario}`, idCanal, fuentes: ['microfono', 'camara', 'pantalla'],
});
console.log(`URL: ${url}\nSala: ${sala}\nVence en: ${expiraEn} s\nToken: ${token}`);
