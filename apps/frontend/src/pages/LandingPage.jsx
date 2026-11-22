import '../styles/landing-fonts.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Icon from '../components/ui/Icon.jsx';
import { createGlassStage, WORDS } from '../components/landing/glassStage.js';
import { suckMap } from '../components/landing/suckMap.js';
import { useVoiceLevels, VOCES } from '../components/landing/useVoiceLevels.js';
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

function reducido() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const raiz = useRef(null);
  const capa = useRef(null);
  const filtro = useRef(null);
  const mapa = useRef(null);
  const desplazamiento = useRef(null);
  const lienzo = useRef(null);
  const cta = useRef(null);
  const ultimoY = useRef(0);
  const deformacion = useRef(0);
  const escena = useRef({
    accent: ACENTO,
    view: lienzo,
    cta,
    p: 0,
    mx: 0,
    my: 0,
    drop: -0.64,
    hero: { lines: [], left: false, x: 0, y: 0 },
    empText: null,
  });
  const [sinGL, setSinGL] = useState(false);
  const [inicioOculto, setInicioOculto] = useState(false);
  const [palabraFinal, setPalabraFinal] = useState(EMPEZA);
  const [explosion, setExplosion] = useState(null);
  const { letras, habla, micActivo, micError, alternarMic, empujar } = useVoiceLevels(5);

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

  const aplicarDeformacion = useCallback((p) => {
    const el = capa.current;
    const disp = desplazamiento.current;
    if (!el || !disp) return;
    const hp = Math.min(1, Math.max(0, p / 0.085));
    const fuerza = hp * hp;
    if (fuerza < 0.002 || !deformacion.current) {
      el.style.filter = 'none';
      disp.setAttribute('scale', '0');
      return;
    }
    disp.setAttribute('scale', (2 * deformacion.current * fuerza * 1.15).toFixed(1));
    el.style.filter = 'url(#landing-succion)';
  }, []);

  useEffect(() => {
    const el = capa.current;
    if (!el) return undefined;
    function armar() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h || !filtro.current || !mapa.current) return;
      const m = suckMap(w, h);
      if (!m) return;
      deformacion.current = m.dmax;
      for (const nodo of [filtro.current, mapa.current]) {
        nodo.setAttribute('width', String(w));
        nodo.setAttribute('height', String(h));
      }
      mapa.current.setAttribute('href', m.url);
      aplicarDeformacion(escena.current.p);
    }
    armar();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(armar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aplicarDeformacion]);

  function alScrollear(e) {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 0;
    empujar(el.scrollTop - ultimoY.current);
    ultimoY.current = el.scrollTop;
    escena.current.p = p;
    raiz.current?.style.setProperty('--p', p.toFixed(4));
    const oculto = p > FIN_INICIO;
    if (oculto !== inicioOculto) setInicioOculto(oculto);
    cicloFinal(p > 0.765);
    aplicarDeformacion(p);
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

  const irAlRegistro = useCallback(() => navigate('/register'), [navigate]);

  const personas = micActivo
    ? [{ nombre: 'Vos', inicial: 'V', color: ACENTO, estado: 'Hablando', activo: true }, ...VOCES.slice(0, 2).map((v) => ({ ...v, estado: 'Escuchando', activo: false }))]
    : VOCES.map((v, i) => ({ ...v, estado: i === habla ? 'Hablando' : 'Escuchando', activo: i === habla }));

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
              <div className="landing-sumidero" aria-hidden="true" />
              <svg width="0" height="0" aria-hidden="true" className="landing-defs">
                <filter id="landing-tinta" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="landing-succion" ref={filtro} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900" colorInterpolationFilters="sRGB">
                  <feImage ref={mapa} x="0" y="0" width="1440" height="900" preserveAspectRatio="none" result="m" />
                  <feDisplacementMap ref={desplazamiento} in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </svg>

              <div className="landing-capa" ref={capa}>
                <div className="landing-poster" aria-hidden="true">
                  <div className="landing-linea">
                    {['D', 'I', 'A'].map((l, i) => (
                      <span key={l} className={`landing-letra l${i}`} ref={(n) => { letras.current[i] = n; }}>{l}</span>
                    ))}
                  </div>
                  <div className="landing-linea segunda">
                    {['L', 'O'].map((l, i) => (
                      <span key={l} className={`landing-letra l${i + 3}`} ref={(n) => { letras.current[i + 3] = n; }}>{l}</span>
                    ))}
                  </div>
                  <span className="landing-en-vivo"><span className="landing-punto" />estudio, en vivo</span>
                </div>

                <div className="landing-texto">
                  <p>Entrá a un canal de voz cuando quieras, hablá con tu gente y salí con un toque. Sin llamar a nadie.</p>
                  <div className="landing-acciones">
                    <button type="button" className="landing-boton pr" onClick={crearCuenta}>Crear cuenta</button>
                    <button type="button" className="landing-boton claro pr" onClick={alternarMic} aria-pressed={micActivo}>
                      <Icon name="microfono" size={16} stroke={2.2} />
                      {micActivo ? 'Dejar de escucharme' : 'Probar con tu voz'}
                    </button>
                  </div>
                  {micError && <p role="alert" className="landing-error">No pudimos usar el micrófono. Revisá el permiso del navegador y volvé a probar.</p>}
                </div>

                <div className="landing-personas" aria-live="polite">
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
