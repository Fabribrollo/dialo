import '../styles/landing-fonts.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Icon from '../components/ui/Icon.jsx';
import { createGlassStage, WORDS } from '../components/landing/glassStage.js';
import SignupBurst from '../components/landing/SignupBurst.jsx';
import '../styles/landing.css';

const ACENTO = '#6A3CF5';
const FASES = [
  { palabra: 'Escribí', desde: 0.13, hasta: 0.26, texto: 'Mensajes privados que llegan al instante' },
  { palabra: 'Hablá', desde: 0.29, hasta: 0.42, texto: 'Canales de voz para entrar y salir cuando quieras' },
  { palabra: 'Mostrá', desde: 0.45, hasta: 0.58, texto: 'Prendé la cámara o compartí tu pantalla' },
  { palabra: 'Juntate', desde: 0.61, hasta: 0.74, texto: 'Comunidades con canales de texto y de voz' },
];
const PROGRESO = [[0, 0.13], [0.13, 0.16], [0.29, 0.16], [0.45, 0.16], [0.61, 0.16], [0.77, 0.13]];
const CARACTERES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnñopqrstuvwxyz0123456789#%&*+=?';
const FIN_INICIO = 0.105;
const EMPEZA = WORDS[WORDS.length - 1];
const HERO = ['Donde se junta', 'tu gente'];
const VOCES = [
  { nombre: 'Cande', inicial: 'C', color: '#A0522D' },
  { nombre: 'Tomi', inicial: 'T', color: '#131316' },
  { nombre: 'Lu', inicial: 'L', color: '#3D5FC4' },
];

function reducido() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const raiz = useRef(null);
  const lienzo = useRef(null);
  const cta = useRef(null);
  const escena = useRef({
    accent: ACENTO,
    view: lienzo,
    cta,
    p: 0,
    mx: 0,
    my: 0,
    drop: -0.64,
    // En pantallas angostas el título va arriba y el vidrio flota debajo; en anchas, uno al lado del otro.
    get hero() {
      const angosta = typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) < 0.85;
      return angosta
        ? { lines: HERO, left: true, tx: 0.07, ty: 250, wf: 0.86, max: 250, x: 0.1, y: -0.12 }
        : { lines: HERO, left: true, tx: 0.06, ty: 410, wf: 0.6, max: 250, x: 0.7, y: 0.06 };
    },
    empText: null,
  });
  const [sinGL, setSinGL] = useState(false);
  const [inicioOculto, setInicioOculto] = useState(false);
  const [palabraFinal, setPalabraFinal] = useState(EMPEZA);
  const [explosion, setExplosion] = useState(null);
  const [habla, setHabla] = useState(2);
  // Quién habla en la llamada de ejemplo va rotando, como en un canal de voz real.
  useEffect(() => {
    if (reducido()) return undefined;
    const id = setInterval(() => setHabla((h) => (h + 1) % VOCES.length), 3400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    escena.current.noGL = () => setSinGL(true);
    const stage = createGlassStage(escena.current);
    escena.current.stage = stage;
    return () => stage.stop();
  }, []);

  const mostrarPalabra = useCallback((texto) => {
    escena.current.empText = texto;
    escena.current.stage?.word(texto);
    setPalabraFinal(texto);
  }, []);

  const mezclar = useRef({ intervalo: 0, ciclo: 0, activo: false });
  const mezclarHacia = useCallback((destino) => {
    clearInterval(mezclar.current.intervalo);
    if (reducido()) return mostrarPalabra(destino);
    let paso = 0;
    const total = 20;
    mezclar.current.intervalo = setInterval(() => {
      paso++;
      const fijas = Math.floor((paso / total) * destino.length);
      let salida = '';
      for (let i = 0; i < destino.length; i++) {
        salida += i < fijas ? destino[i] : CARACTERES[Math.floor(Math.random() * CARACTERES.length)];
      }
      mostrarPalabra(paso >= total ? destino : salida);
      if (paso >= total) clearInterval(mezclar.current.intervalo);
    }, 85);
  }, [mostrarPalabra]);

  const cicloFinal = useCallback((activo) => {
    const m = mezclar.current;
    if (activo === m.activo) return;
    m.activo = activo;
    clearInterval(m.ciclo);
    if (!activo) {
      clearInterval(m.intervalo);
      mostrarPalabra(EMPEZA);
      return;
    }
    mezclarHacia(EMPEZA);
    m.ciclo = setInterval(() => mezclarHacia(EMPEZA), 4800);
  }, [mezclarHacia, mostrarPalabra]);

  useEffect(() => () => {
    clearInterval(mezclar.current.intervalo);
    clearInterval(mezclar.current.ciclo);
  }, []);

  function alScrollear(e) {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 0;
    escena.current.p = p;
    raiz.current?.style.setProperty('--p', p.toFixed(4));
    const oculto = p > FIN_INICIO;
    if (oculto !== inicioOculto) setInicioOculto(oculto);
    cicloFinal(p > 0.765);
  }

  function alMoverPuntero(e) {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    raiz.current?.style.setProperty('--mx', x.toFixed(3));
    raiz.current?.style.setProperty('--my', y.toFixed(3));
    escena.current.mx = x;
    escena.current.my = y;
  }

  function crearCuenta(e) {
    const r = raiz.current?.getBoundingClientRect();
    const b = e.currentTarget.getBoundingClientRect();
    if (!r) return navigate('/register');
    setExplosion({
      ancho: r.width,
      alto: r.height,
      boton: { left: b.left - r.left, top: b.top - r.top, width: b.width, height: b.height },
    });
  }

  // Baja hasta la primera escena del recorrido con el desplazamiento suave del navegador.
  function verRecorrido() {
    const el = raiz.current?.querySelector('.landing-scroll');
    if (!el) return;
    el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * 0.2, behavior: reducido() ? 'auto' : 'smooth' });
  }

  // El registro arranca con los íconos ya ubicados y el fondo igual al del final de la animación.
  const irAlRegistro = useCallback(() => navigate('/register', { state: { desdeInicio: true } }), [navigate]);

  const personas = VOCES.map((v, i) => ({ ...v, estado: i === habla ? 'Hablando' : 'Escuchando', activo: i === habla }));

  return (
    <div className={`landing${explosion ? ' bloqueada' : ''}`} ref={raiz} style={{ '--acc': ACENTO }}>
      <div className="landing-scroll" onScroll={alScrollear} onPointerMove={alMoverPuntero}>
        <div className="landing-pista">
          <div className="landing-escena">
            <h1 className="sr-only">Dialo: mensajes, voz, video y comunidades con tu gente</h1>

            {sinGL ? (
              <div className="landing-palabras" aria-hidden="true">
                {FASES.map((f) => (
                  <span key={f.palabra} className="landing-fase" style={{ '--a': f.desde, '--b': f.hasta }}>{f.palabra}</span>
                ))}
                <span className="landing-fase ultima" style={{ '--a': 0.77, '--b': 2 }}>{palabraFinal}</span>
              </div>
            ) : (
              <canvas
                ref={lienzo}
                className="landing-lienzo"
                role="img"
                aria-label="Una pieza de vidrio que flota sobre la palabra y se transforma en mensaje, llamada, pantalla, comunidad y botón"
              />
            )}

            <nav className="landing-nav" aria-label="Principal">
              <Link to="/inicio" className="landing-marca">
                <svg width="40" height="25" viewBox="0 0 220 140" aria-hidden="true"><circle cx="80" cy="70" r="60" fill="#131316" /><circle cx="140" cy="70" r="60" style={{ fill: 'var(--acc)' }} /><path d="M110 18.04A60 60 0 0 1 110 121.96A60 60 0 0 1 110 18.04Z" fill="#fff" /></svg>
                <span>dialo</span>
              </Link>
              <Link to="/login" className="landing-entrar">Entrar</Link>
              <button type="button" className="landing-boton chico pr" onClick={crearCuenta}>Crear cuenta</button>
            </nav>

            <div className="landing-subtitulos" aria-hidden="true">
              {FASES.map((f) => (
                <p key={f.texto} className="landing-subtitulo" style={{ '--a': f.desde, '--b': f.hasta }}>{f.texto}</p>
              ))}
            </div>

            <div className="landing-final">
              <div className="landing-cta" ref={cta}>
                <button type="button" className="landing-cta-boton" onClick={crearCuenta}>
                  Crear cuenta
                  <span className="landing-cta-flecha"><Icon name="flecha" size={24} stroke={2.4} /></span>
                </button>
                <Link to="/login" className="landing-cta-alt">Ya tengo cuenta</Link>
              </div>
            </div>

            <div className="landing-progreso" aria-hidden="true">
              {PROGRESO.map(([desde, largo]) => (
                <span key={desde}><span style={{ '--a': desde, '--l': largo }} /></span>
              ))}
            </div>

            <section className="landing-inicio" style={{ visibility: inicioOculto ? 'hidden' : 'visible' }} aria-label="Inicio">
              {sinGL && <p className="landing-hero-plano" aria-hidden="true">{HERO.map((l) => <span key={l}>{l}</span>)}</p>}
              <div className="landing-capa">
                <div className="landing-texto">
                  <p>Entrá a un canal de voz cuando quieras, hablá con tu gente y salí con un toque. Sin llamar a nadie.</p>
                  <div className="landing-acciones">
                    <button type="button" className="landing-boton pr" onClick={crearCuenta}>Crear cuenta</button>
                    <button type="button" className="landing-boton claro pr" onClick={verRecorrido}>Ver cómo es</button>
                  </div>
                </div>

                <div className="landing-personas">
                  {personas.map((p) => (
                    <span key={p.nombre} className={`landing-persona${p.activo ? ' activa' : ''}`}>
                      <span className="landing-avatar" style={{ background: p.color }}>{p.inicial}</span>
                      <span className="landing-persona-datos"><b>{p.nombre}</b><span>{p.estado}</span></span>
                    </span>
                  ))}
                </div>
              </div>

              <span className="landing-bajar" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            </section>
          </div>
        </div>
      </div>

      {explosion && <SignupBurst origen={explosion} onTerminar={irAlRegistro} />}
    </div>
  );
}
