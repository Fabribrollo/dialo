import { useNavigate, useParams } from 'react-router';
import CommunityForm from '../components/communities/CommunityForm.jsx';
import DeleteCommunityCard from '../components/communities/DeleteCommunityCard.jsx';
import Icon from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import '../styles/page.css';

export default function CommunityFormPage() {
  const { id: param } = useParams();
  const navigate = useNavigate();
  const editing = param !== undefined;
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  const back = editing && detail.valid ? `/comunidades/${id}` : '/comunidades';
  const backLabel = editing && detail.comunidad ? `Volver a ${detail.comunidad.nombre}` : 'Volver';

  return (
    <div className="page">
      <header className="page-head form-head">
        <button type="button" className="lg pr form-back" aria-label={backLabel} onClick={() => navigate(back)}>
          <span className="form-back-ic"><Icon name="chevron" size={18} stroke={2} /></span>
        </button>
        <h1 className="dsp">{editing ? 'Editar comunidad' : 'Crear comunidad'}</h1>
      </header>
      <div className="page-body form-body">
        {editing && !detail.comunidad ? <CommunityState {...detail} /> : (
          <>
            {editing && detail.error && <Notice tone="error" title="No se pudo actualizar la información." actionLabel="Reintentar" onAction={detail.reload} />}
            <CommunityForm key={editing ? id : 'new'} comunidad={editing ? detail.comunidad : null} />
            {editing && detail.comunidad.miRol === 'PROPIETARIO' && <DeleteCommunityCard comunidad={detail.comunidad} />}
          </>
        )}
      </div>
    </div>
  );
}
