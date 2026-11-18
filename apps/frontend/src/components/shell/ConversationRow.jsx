import { Link } from 'react-router';
import Avatar from '../ui/Avatar.jsx';
import CommunityTile from '../ui/CommunityTile.jsx';

export default function ConversationRow({ to, nombre, foto, preview, time, community = false, onClick }) {
  return (
    <Link to={to} className="row" onClick={onClick}>
      {community ? <CommunityTile nombre={nombre} imagen={foto} /> : <Avatar nombre={nombre} foto={foto} />}
      <span className="row-text">
        <span className="nm">{nombre}</span>
        {preview && <span className="pv">{preview}</span>}
      </span>
      {time && <span className="tm">{time}</span>}
    </Link>
  );
}
