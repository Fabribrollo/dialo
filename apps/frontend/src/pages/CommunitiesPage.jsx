import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { Link, useLocation, useNavigate } from 'react-router';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { ListRow, RowText } from '../components/ui/Card.jsx';
import CommunityTile from '../components/ui/CommunityTile.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Icon from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import '../styles/page.css';
import '../styles/communitiesList.css';

export const COMMUNITY_ROLES = { PROPIETARIO: 'Propietario', ADMIN: 'Admin', MODERADOR: 'Moderador', INTEGRANTE: 'Integrante' };

export default function CommunitiesPage() {
  const { items, loading, error, reload } = useCommunities();
  const { state } = useLocation();
  const navigate = useNavigate();
  const crear = () => navigate('/comunidades/nueva');

  return (
    <div className="page">
      <header className="page-head page-head-line cl-head">
        <span className="cl-title">
          <h1 className="dsp">Comunidades</h1>
          <span className="cl-sub">Las comunidades a las que pertenecés.</span>
        </span>
        <Button onClick={crear}><Icon name="mas" size={15} stroke={2.2} />Crear comunidad</Button>
      </header>
      <div className="page-body cl-body">
        {state?.notice && <Notice tone="exito" title={state.notice} />}
        {error && <Notice tone="error" title="No se pudieron cargar las comunidades" actionLabel="Reintentar" onAction={reload}>Revisá tu conexión.</Notice>}
        {loading ? (
          <SkeletonRows rows={4} avatar={52} square label="Cargando comunidades…" />
        ) : items.length === 0 && !error ? (
          <EmptyState icon="comunidades" title="No pertenecés a ninguna comunidad" actionLabel="Crear comunidad" onAction={crear}>
            Podés crear una o entrar con un enlace de invitación.
          </EmptyState>
        ) : (
          <Card as="ul">
            {items.map((c) => (
              <ListRow as="li" key={c.id}>
                <Link className="cl-link" to={`/comunidades/${c.id}`}>
                  <CommunityTile nombre={c.nombre} imagen={c.imagenUrl} size={42} />
                  <RowText title={c.nombre}>
                    {c.tipo === 'PUBLICA' ? 'Pública' : 'Privada'} · {c.cantidadIntegrantes} {c.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}
                  </RowText>
                  <span className="cl-role">{COMMUNITY_ROLES[c.miRol]}</span>
                </Link>
              </ListRow>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
