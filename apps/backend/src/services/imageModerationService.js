import { askDecisions } from '../utils/decisions.js';
import { AppError } from '../utils/AppError.js';

const UMBRAL = 0.8;

const questions = [
  { type: 'predicate', name: 'sexual', instructions: '¿La imagen muestra desnudez o contenido sexual explícito?' },
  { type: 'predicate', name: 'violencia', instructions: '¿La imagen muestra violencia gráfica, sangre o heridas?' },
  { type: 'predicate', name: 'odio', instructions: '¿La imagen contiene símbolos o mensajes de odio?' },
];

export async function moderateImage(buffer, mimetype) {
  const input = [{
    role: 'user',
    content: [{
      type: 'input_image',
      image_url: `data:${mimetype};base64,${buffer.toString('base64')}`,
      detail: 'low',
    }],
  }];
  const resultado = await askDecisions(input, questions);
  if (!resultado) return;
  const bloqueada = Object.values(resultado).some((probabilidad) => probabilidad >= UMBRAL);
  if (bloqueada) throw new AppError(422, 'IMAGE_BLOCKED', 'La imagen no cumple las normas y ha sido bloqueada.');
}
