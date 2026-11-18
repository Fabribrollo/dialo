import { useState } from 'react';
import { useNavigate } from 'react-router';
import { openConversation } from '../../services/conversationsService.js';
import { useConversations } from '../../context/ConversationsContext.jsx';
import Card, { ListRow } from '../ui/Card.jsx';
import SearchInput from '../ui/SearchInput.jsx';
import Icon from '../ui/Icon.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { ConfirmDialog } from '../ui/Dialog.jsx';
import { BotonAccion } from './BotonAccion.jsx';
import { UsuarioInfo } from './UsuarioInfo.jsx';

const presencia = { EN_LINEA: 'En línea', AUSENTE: 'Ausente', NO_MOLESTAR: 'No molestar', INVISIBLE: 'Ausente' };

export function AmigosLista({ friends }) {
  const navigate = useNavigate();
  const { remember } = useConversations();
  const [filtro, setFiltro] = useState('');
  const [eliminando, setEliminando] = useState(null);
  const [estado, setEstado] = useState({ busy: false, error: '' });

  if (friends.amigos.length === 0) {
    return <EmptyState icon="amigos" title="Todavía no tenés amigos">Buscá personas arriba.</EmptyState>;
  }

  const enLinea = friends.amigos.filter(({ usuario }) => usuario.disponibilidad === 'EN_LINEA').length;
  const visibles = friends.amigos.filter(({ usuario }) => `${usuario.nombreVisible} ${usuario.nombreUsuario}`.toLowerCase().includes(filtro.trim().toLowerCase()));

  async function confirmar() {
    setEstado({ busy: true, error: '' });
    try {
      await friends.eliminar(eliminando.id);
      setEliminando(null);
      setEstado({ busy: false, error: '' });
    } catch {
      setEstado({ busy: false, error: 'No se pudo eliminar. Probá de nuevo.' });
    }
  }

  return (
    <>
      <div className="fr-bar">
        <SearchInput className="fr-filter" label="Filtrar amigos" placeholder="Filtrar amigos" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="fr-count">{friends.amigos.length} amigos · {enLinea} en línea</span>
      </div>
      <Card as="ul">
        {visibles.map(({ usuario }) => (
          <ListRow as="li" key={usuario.id}>
            <UsuarioInfo usuario={usuario} presencia>{presencia[usuario.disponibilidad]}</UsuarioInfo>
            <BotonAccion accion={async () => {
              const { conversacion } = await openConversation(usuario.id);
              remember(conversacion);
              navigate(`/conversaciones/${conversacion.id}`);
            }}>
              <Icon name="mensajes" size={15} stroke={2} />Conversar
            </BotonAccion>
            <button type="button" className="li-quiet pr" aria-label={`Eliminar a ${usuario.nombreVisible} de tus amigos`} onClick={() => setEliminando(usuario)}>Eliminar</button>
          </ListRow>
        ))}
      </Card>
      <ConfirmDialog
        open={eliminando !== null}
        title={`¿Eliminar a ${eliminando?.nombreVisible ?? ''} de tus amigos?`}
        confirmLabel={estado.busy ? 'Eliminando…' : 'Eliminar amigo'}
        loading={estado.busy}
        error={estado.error}
        onCancel={() => { setEliminando(null); setEstado({ busy: false, error: '' }); }}
        onConfirm={confirmar}
      >
        Ya no van a poder escribirse. Los mensajes que ya se mandaron siguen en el chat.
      </ConfirmDialog>
    </>
  );
}
