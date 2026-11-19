// Mantiene visibles los efectos poscommit para poder drenarlos al cerrar el servidor o las pruebas.
const pending = new Set();
export function trackEffect(effect) {
  const promise = Promise.resolve(effect).catch((error) => console.error(error));
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
  return promise;
}
export async function drainEffects() {
  while (pending.size) await Promise.all([...pending]);
}
