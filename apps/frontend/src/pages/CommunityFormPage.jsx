import { Link, useParams } from 'react-router';
import CommunityForm from '../components/communities/CommunityForm.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';

export default function CommunityFormPage() {
  const { id: param } = useParams();
  const editing = param !== undefined;
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  useLostCommunity(detail.lost);
  const title = editing ? 'Editar comunidad' : 'Crear comunidad';
  return <section className="page-container communities-page">
    <Link className="community-back" to={editing && detail.valid ? `/comunidades/${id}` : '/comunidades'}>← {editing ? 'Volver a la comunidad' : 'Comunidades'}</Link>
    <header className="page-heading"><h1>{title}</h1></header>
    {editing && !detail.comunidad ? <CommunityState {...detail} /> : <>
      {editing && detail.error && <p role="alert" className="notice error">No se pudo actualizar la información. <button className="secondary" onClick={detail.reload}>Reintentar</button></p>}
      <CommunityForm key={editing ? id : 'new'} comunidad={editing ? detail.comunidad : null} />
    </>}
  </section>;
}
