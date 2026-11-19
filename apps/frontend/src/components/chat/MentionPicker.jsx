export default function MentionPicker({ value, onChange, members = [], inputId }) {
  const match=/(?:^|\s)@([\p{L}\p{N}_.]*)$/u.exec(value);
  if (!match) return null;
  const query=match[1].toLocaleLowerCase();
  const candidates=members.filter(({usuario})=>usuario && (usuario.nombreUsuario.toLocaleLowerCase().startsWith(query) || usuario.nombreVisible?.toLocaleLowerCase().startsWith(query))).slice(0,6);
  return candidates.length?<div className="mention-picker" role="group" aria-label="Sugerencias de menciones">
    {candidates.map(({usuario})=><button type="button" key={usuario.id} onClick={()=>{
      const start=value.length-match[1].length-1;
      onChange(value.slice(0,start)+'@'+usuario.nombreUsuario+' ');
      const input=inputId&&document.getElementById(inputId);
      if (input) { input.focus(); requestAnimationFrame(()=>{if(input.isConnected)input.setSelectionRange(input.value.length,input.value.length);}); }
    }}>@{usuario.nombreUsuario} · {usuario.nombreVisible}</button>)}
  </div>:null;
}
