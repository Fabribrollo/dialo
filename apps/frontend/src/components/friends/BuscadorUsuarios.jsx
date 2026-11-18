import { useEffect, useRef, useState } from 'react';
import { searchUsers } from '../../services/friendsService.js';
import Card, { ListRow } from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import SearchInput from '../ui/SearchInput.jsx';
import { BotonAccion } from './BotonAccion.jsx';
import { UsuarioInfo } from './UsuarioInfo.jsx';

function AccionRelacion({ usuario, friends }) {
  const relacion = friends.relacionCon(usuario.id);
  if (relacion === 'AMIGOS') return <Badge kind="amigos" />;
  if (relacion === 'SOLICITUD_ENVIADA') return <Badge kind="pendiente" />;
  if (relacion === 'SOLICITUD_RECIBIDA') {
    const solicitud = friends.recibidas.find((s) => s.emisor.id === usuario.id);
    return <BotonAccion variant="primario" accion={() => friends.aceptar(solicitud.id)}>Aceptar solicitud</BotonAccion>;
  }
  return (
    <BotonAccion variant="primario" accion={() => friends.enviar(usuario.id)}>
      <Icon name="mas" size={15} stroke={2.4} />Agregar
    </BotonAccion>
  );
}

export function BuscadorUsuarios({ friends }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [estado, setEstado] = useState('inicial');
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const ultimaBusqueda = useRef(0);
  const texto = q.trim();

  useEffect(() => {
    const numero = ++ultimaBusqueda.current;
    if (texto.length < 2) {
      setResultados([]);
      setEstado('inicial');
      return undefined;
    }
    setEstado('cargando');
    const timer = setTimeout(async () => {
      try {
        const { items } = await searchUsers(texto);
        if (numero !== ultimaBusqueda.current) return;
        setResultados(items.map((item) => item.usuario));
        setEstado('listo');
      } catch (e) {
        if (numero !== ultimaBusqueda.current) return;
        setError(e.message);
        setEstado('error');
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ultimaBusqueda.current++;
    };
  }, [texto, intento]);

  return (
    <div className="fr-search">
      <SearchInput className="fr-search-inp" label="Buscar personas" value={q} maxLength={32} onChange={(e) => setQ(e.target.value)} />
      {texto.length === 1 && <span className="fr-note">Al menos 2 letras</span>}
      {estado === 'cargando' && <span className="fr-note" role="status"><Spinner size={15} />Buscando…</span>}
      {estado === 'error' && <Notice tone="error" title={error} actionLabel="Reintentar" onAction={() => setIntento((n) => n + 1)} />}
      {estado === 'listo' && resultados.length === 0 && (
        <EmptyState icon="amigos" title="No se encontraron personas">Probá con otro nombre o usuario.</EmptyState>
      )}
      {estado === 'listo' && resultados.length > 0 && (
        <>
          <span className="fr-note">{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para “{texto}”</span>
          <Card as="ul">
            {resultados.map((usuario) => (
              <ListRow as="li" key={usuario.id}>
                <UsuarioInfo usuario={usuario} />
                <AccionRelacion usuario={usuario} friends={friends} />
              </ListRow>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
