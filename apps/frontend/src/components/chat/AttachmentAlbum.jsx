import {MessageOptions,MessageReactions,ReplyQuote} from './MessageInteractions.jsx';
import {openProfile} from '../../utils/profiles.js';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import {API_URL} from '../../constants/api.js';
import {useMediaGallery} from './MediaGallery.jsx';
import './attachmentCard.css';
export default function AttachmentAlbum({messages,own,first,autor}){
 const gallery=useMediaGallery(),visible=messages.slice(0,4),remaining=messages.length>4?messages.length-3:0;
 const captions=messages.filter(m=>m.contenido&&m.contenido!=='Archivo adjunto');
 const date=messages[0].fechaCreacion;const time=new Date(date).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false});
 return <li className={`msg attachment-album-message ${own?'msg-right':''} ${autor&&!own?'msg-author':''}`}>
 {autor&&!own&&(first?<Avatar idUsuario={autor.id} nombre={autor.nombreVisible} foto={autor.fotoUrl} color={autor.colorAvatar} size={38} className="msg-av"/>:<span className="msg-av-gap"/>)}
 <div className="msg-col"><article className={`message-bubble bubble-album ${own?'bubble-own':'bubble-other'}`}>
 {first&&autor&&!own&&<button type="button" className="bubble-author profile-name" onClick={()=>openProfile(autor.id)}>{autor.nombreVisible}</button>}
 <MessageOptions message={messages[0]}/><ReplyQuote message={messages[0]}/><div className="attachment-album" role="group" aria-label={`Álbum de ${messages.length} recursos`}>
 <div className="attachment-album-grid">{visible.map((message,i)=>{const f=message.adjunto,href=`${API_URL}/files/${f.id}`,image=f.tipo?.startsWith('image/'),video=f.tipo?.startsWith('video/'),audio=f.tipo?.startsWith('audio/');return <div className="album-cell" data-message-id={message.id} tabIndex={-1} key={message.id}><button type="button" className="album-tile" aria-label={i===3&&remaining?`Abrir ${remaining} recursos restantes`:`Abrir ${f.nombre}`} onClick={e=>gallery?.open(f,e.currentTarget)}>
 {image?<img src={href} alt="" loading="lazy"/>:video?<><video src={href} muted playsInline preload="metadata"/><span className="album-video"><Icon name="camara" size={20}/></span></>:<span className="album-document"><Icon name={audio?'microfono':'subir'} size={24}/><b>{audio?'Audio':'PDF'}</b></span>}
 {i===3&&remaining>0&&<span className="album-more" aria-hidden="true">+{remaining}</span>}
 </button><MessageReactions message={message}/></div>;})}</div>
 {captions.map(m=><p className="album-caption" key={m.id}>{m.contenido}</p>)}
 </div><footer className="bubble-footer"><span className="bubble-meta"><time dateTime={date}>{time}</time>{own&&messages[0].idConversacion&&<span className={messages.every(m=>m.fechaLectura)?'receipt-read':'receipt'} aria-label={messages.every(m=>m.fechaLectura)?'Leído':messages.every(m=>m.fechaEntrega)?'Entregado':'Enviado'}>{messages.every(m=>m.fechaEntrega||m.fechaLectura)?'✓✓':'✓'}</span>}</span></footer></article></div></li>;
}
