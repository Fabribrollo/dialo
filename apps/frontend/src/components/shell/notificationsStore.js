import { useSyncExternalStore } from 'react';

// Comparte el contador y la acción de abrir el panel con la navegación del celular.
let estado = { noLeidas: 0, abrir: null };
const oyentes = new Set();

export const notificationsStore = {
  get: () => estado,
  set(cambios) {
    estado = { ...estado, ...cambios };
    oyentes.forEach((fn) => fn());
  },
  subscribe(fn) {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  },
};

export function useNotificationsSummary() {
  return useSyncExternalStore(notificationsStore.subscribe, notificationsStore.get, notificationsStore.get);
}

// Columna fija arriba a la derecha que comparten los avisos y las invitaciones a llamadas.
export function avisosRoot() {
  let el = document.getElementById('dialo-avisos');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dialo-avisos';
    el.className = 'ntf-stack';
    document.body.append(el);
  }
  return el;
}
