import ChatExtras from './ChatExtras.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';
import {ReplyComposer} from './MessageInteractions.jsx';
import SharedFiles from './SharedFiles.jsx';
import Icon, {Spinner} from '../ui/Icon.jsx';
import { useRefraction } from '../ui/Refraction.jsx';
import './composer.css';

export default function Composer({ value, onChange, onSend, sending=false, placeholder, label, disabled, canSend, sendLabel = 'Enviar mensaje', id,attachment }) {
  const [ref, filtro] = useRefraction({ scale: 24, backdrop: 'blur(8px) saturate(1.8) brightness(1.06)' });
  return (
    <><ChatExtras/><ReplyComposer/><form ref={ref} className="lg composer-bar" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      {attachment&&<><SharedFiles {...attachment} canWrite={!disabled}/><VoiceRecorder {...attachment} disabled={disabled||sending}/></>}
      <textarea
        id={id}
        rows={1}
        maxLength={2000}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button type="submit" className="ib pr lg dk" aria-label={sendLabel} disabled={!canSend} aria-busy={sending||undefined}>
        {sending?<Spinner size={19}/>:<Icon name="enviar" size={19} stroke={2.4} />}
      </button>
      {sending&&<span className="sr-only" role="status">Enviando mensaje…</span>}
      {filtro}
    </form></>
  );
}
