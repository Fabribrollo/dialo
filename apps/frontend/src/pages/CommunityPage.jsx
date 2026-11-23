import Skeleton, { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import CommunityDashboard from '../components/communities/CommunityDashboard.jsx';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { leaveCommunity } from '../services/communitiesService.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Spinner } from '../components/ui/Icon.jsx';
import { ConfirmDialog } from '../components/ui/Dialog.jsx';
import '../styles/page.css';
import '../components/communities/communityDashboard.css';

export function CommunityState({ valid, lost, loading, error, comunidad, reload }) {
  const navigate = useNavigate();
  const volver = () => navigate('/comunidades');
  let content = null;
  if (!valid) content = <div className="cs-error"><h1 className="cs-title">Comunidad inválida</h1><Button size="sm" onClick={volver}>Volver a comunidades</Button></div>;
  else if (lost) content = <span className="cs-loading" role="status"><Spinner size={15} />Volviendo a comunidades…</span>;
  else if (loading) content = <div className="cs-skel"><Skeleton height={140} radius={24} /><SkeletonRows rows={3} avatar={36} label="Cargando comunidad…" /></div>;
  else if (!comunidad) {
    const sinAcceso = [403, 404].includes(error?.status);
    content = (
      <div className="cs-error">
        <h1 className="cs-title">No pudimos abrir la comunidad</h1>
        <p role="alert" className="cs-text">{sinAcceso ? 'La comunidad no existe o no tenés acceso.' : 'No se pudo cargar la comunidad.'}</p>
        <div className="cs-actions">
          {![401, 403, 404].includes(error?.status) && <Button size="sm" onClick={reload}>Reintentar</Button>}
          <Button size="sm" variant={sinAcceso ? 'primario' : 'secundario'} onClick={volver}>Volver a comunidades</Button>
        </div>
      </div>
    );
  }
  return content && <div className="cs-wrap">{content}</div>;
}

export function useLostCommunity(lost) {
  const navigate = useNavigate();
  useEffect(() => {
    if (lost) navigate('/comunidades', { replace: true, state: { notice: 'La comunidad ya no está disponible para tu cuenta.' } });
  }, [lost, navigate]);
}

export default function CommunityPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  const { comunidad, error } = detail;
  const { forget } = useCommunities();
  const [dialog, setDialog] = useState(null);
  const [estado, setEstado] = useState({ busy: false, error: '' });
  const actionVersion = useRef(0);
  const navigate = useNavigate();
  const { state } = useLocation();
  useLostCommunity(detail.lost);
  useEffect(() => { setDialog(null); }, [id]);
  useEffect(() => {
    actionVersion.current++;
    return () => { actionVersion.current++; };
  }, [id]);
  const isOwner = comunidad?.miRol === 'PROPIETARIO';

  function cerrar() {
    setDialog(null);
    setEstado({ busy: false, error: '' });
  }

  async function confirmar() {
    const version = actionVersion.current;
    setEstado({ busy: true, error: '' });
    try {
      await leaveCommunity(id);
      forget(id);
      if (version === actionVersion.current) {
        navigate('/comunidades', { replace: true, state: { notice: 'Abandonaste la comunidad.' } });
      }
    } catch (e) {
      setEstado({ busy: false, error: e.message || 'No se pudo completar. Probá de nuevo.' });
    }
  }

  if (!comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;

  return (
    <CommunityShell comunidad={comunidad}>
      {state?.notice && <Notice tone="exito" title={state.notice} />}
      {error && <Notice tone="error" title="No se pudo actualizar la información" actionLabel="Reintentar" onAction={detail.reload}>Lo que ves puede estar desactualizado.</Notice>}
      <div className="cd-grid">
        <CommunityDashboard key={comunidad.id} comunidad={comunidad} />
        {!isOwner && <Card className="cd-danger">
          <h2 className="page-h2 cd-danger-title">Salir de la comunidad</h2>
          <div className="cd-danger-btns">
            <Button size="sm" variant="secundario" onClick={() => setDialog('abandonar')}>Abandonar comunidad</Button>
          </div>
        </Card>}
      </div>
      <ConfirmDialog
        open={dialog === 'abandonar'}
        title={`¿Abandonar «${comunidad.nombre}»?`}
        confirmLabel="Abandonar comunidad"
        loading={estado.busy}
        error={estado.error}
        onCancel={cerrar}
        onConfirm={confirmar}
      >
        Vas a perder el acceso a la comunidad y sus canales. Para volver a una comunidad privada vas a necesitar una invitación válida.
      </ConfirmDialog>
    </CommunityShell>
  );
}
