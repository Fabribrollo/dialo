import { useCallback, useEffect, useRef, useState } from 'react';

export const VOCES = [
  { nombre: 'Cande', inicial: 'C', color: '#C9764F' },
  { nombre: 'Tomi', inicial: 'T', color: '#131316' },
  { nombre: 'Lu', inicial: 'L', color: '#5B7FE0' },
];

const TURNO = 3.4;

function reducido() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Estira las letras del póster con una voz simulada, con el micrófono o con la velocidad del scroll.
export function useVoiceLevels(cantidad) {
  const letras = useRef([]);
  const niveles = useRef(new Array(cantidad).fill(0));
  const velocidad = useRef(0);
  const audio = useRef(null);
  const [habla, setHabla] = useState(0);
  const [micActivo, setMicActivo] = useState(false);
  const [micError, setMicError] = useState(false);

  useEffect(() => {
    const quieto = reducido();
    const inicio = performance.now();
    let turnoActual = -1;
    let frame = requestAnimationFrame(function paso(ahora) {
      frame = requestAnimationFrame(paso);
      const t = (ahora - inicio) / 1000;
      const objetivo = new Array(cantidad).fill(0);
      const a = audio.current;
      if (a) {
        a.analizador.getByteFrequencyData(a.bandas);
        for (let i = 0; i < cantidad; i++) {
          let suma = 0;
          const desde = 2 + i * 6;
          for (let j = desde; j < desde + 6; j++) suma += a.bandas[j];
          objetivo[i] = Math.min(1, suma / 6 / 170);
        }
      } else if (!quieto) {
        const turno = Math.floor(t / TURNO);
        const local = t - turno * TURNO;
        if (turno !== turnoActual) {
          turnoActual = turno;
          setHabla(turno % VOCES.length);
        }
        const silaba = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 4.1 + turno)), 0.7);
        const palabra = Math.min(1, Math.max(0, Math.sin(t * 2 * Math.PI * 0.9 + turno * 1.3) + 0.35));
        const envolvente = (local < 2.8 ? 1 : 0) * silaba * palabra * 0.8;
        for (let k = 0; k < cantidad; k++) objetivo[k] = envolvente * (0.55 + 0.45 * Math.sin(t * 6.3 + k * 1.9 + turno));
      }
      velocidad.current *= 0.9;
      const empuje = quieto ? 0 : Math.min(1, velocidad.current / 40);
      for (let m = 0; m < cantidad; m++) {
        const meta = Math.min(1.2, objetivo[m] + empuje * (0.8 + 0.2 * Math.sin(m * 2.1 + t * 9)));
        const actual = niveles.current[m];
        niveles.current[m] = actual + (meta - actual) * (meta > actual ? 0.45 : 0.12);
        const el = letras.current[m];
        if (el) {
          const v = niveles.current[m];
          el.style.transform = `scaleY(${(1 + v * 0.34).toFixed(3)}) scaleX(${(1 - v * 0.06).toFixed(3)})`;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [cantidad]);

  const detenerMic = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    a.stream.getTracks().forEach((pista) => pista.stop());
    a.contexto.close();
    audio.current = null;
  }, []);

  useEffect(() => detenerMic, [detenerMic]);

  const alternarMic = useCallback(async () => {
    if (audio.current) {
      detenerMic();
      setMicActivo(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Contexto = window.AudioContext || window.webkitAudioContext;
      const contexto = new Contexto();
      const analizador = contexto.createAnalyser();
      analizador.fftSize = 128;
      analizador.smoothingTimeConstant = 0.6;
      contexto.createMediaStreamSource(stream).connect(analizador);
      audio.current = { stream, contexto, analizador, bandas: new Uint8Array(analizador.frequencyBinCount) };
      setMicActivo(true);
      setMicError(false);
    } catch {
      setMicError(true);
      setMicActivo(false);
    }
  }, [detenerMic]);

  const empujar = useCallback((delta) => {
    velocidad.current += Math.abs(delta);
  }, []);

  return { letras, habla, micActivo, micError, alternarMic, empujar };
}
