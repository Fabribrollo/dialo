import { Outlet } from 'react-router';
import { Logo } from './shell/BootScreen.jsx';
import Icon from './ui/Icon.jsx';
import './auth.css';

export default function AuthLayout() {
  return (
    <div className="auth">
      <section className="auth-hero" aria-hidden="true">
        <span className="auth-brand"><Logo /><span className="dsp">dialo</span></span>
        <h2 className="dsp">Mensajes privados, canales y contactos en un mismo lugar.</h2>
        <div className="auth-art">
          <div className="lg dk auth-call">
            <span className="auth-call-avs"><span className="auth-av auth-av-talk">T</span><span className="auth-av auth-av-2">C</span></span>
            <span className="auth-call-ic"><Icon name="canalVoz" size={18} stroke={2.1} /></span>
            <span className="auth-call-text"><b>Llamada en estudio</b><span>Taller de Redes</span></span>
            <span className="auth-call-join">Unirme</span>
          </div>
          <span className="auth-bub">Che, al final el jueves vamos al labo?</span>
          <span className="ac auth-own">Sí, voy después de las 18</span>
          <span className="lg auth-chan"><Icon name="canalTexto" size={15} stroke={2.2} />parciales<span className="auth-dot" /></span>
        </div>
      </section>
      <main className="win auth-card">
        <Outlet />
      </main>
    </div>
  );
}
