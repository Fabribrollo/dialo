// Prueba manual de revocacion: saca a un participante de la sala y mide cuanto tarda LiveKit en confirmar.
import { media } from '../src/services/mediaService.js';

const [idUsuario, idCanal] = process.argv.slice(2).map(Number);
if (!idUsuario || !idCanal) {
  console.error('Uso: npm run media:sacar -w apps/backend -- <idUsuario> <idCanal>');
  process.exit(1);
}
const inicio = Date.now();
const estaba = await media.sacarParticipante(idCanal, idUsuario);
console.log(estaba ? `Desconectado en ${Date.now() - inicio} ms` : 'El usuario no estaba en la sala');
