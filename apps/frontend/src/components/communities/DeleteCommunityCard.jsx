import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCommunities } from '../../context/CommunitiesContext.jsx';
import { deleteCommunity } from '../../services/communitiesService.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { ConfirmDialog } from '../ui/Dialog.jsx';
import './communityDashboard.css';

export default function DeleteCommunityCard({ comunidad }) {
  const { forget } = useCommunities();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState({ busy: false, error: '' });

  function cerrar() {
    setOpen(false);
    setEstado({ busy: false, error: '' });
  }

  async function confirmar() {
    setEstado({ busy: true, error: '' });
    try {
      await deleteCommunity(comunidad.id);
      forget(comunidad.id);
      navigate('/comunidades', { replace: true, state: { notice: 'Comunidad eliminada.' } });
    } catch (e) {
      setEstado({ busy: false, error: e.message || 'No se pudo completar. Probá de nuevo.' });
    }
  }

  return (
    <>
      <Card className="cd-danger">
        <h2 className="page-h2 cd-danger-title">Eliminar comunidad</h2>
        <div className="cd-danger-btns">
          <Button size="sm" variant="peligro" onClick={() => setOpen(true)}>Eliminar comunidad</Button>
        </div>
      </Card>
      <ConfirmDialog
        open={open}
        title={`¿Eliminar «${comunidad.nombre}»?`}
        confirmLabel={estado.busy ? 'Eliminando…' : 'Eliminar comunidad'}
        confirmText={comunidad.nombre}
        loading={estado.busy}
        error={estado.error}
        onCancel={cerrar}
        onConfirm={confirmar}
      >
        Se eliminan la comunidad, sus canales, los mensajes de esos canales y las invitaciones. No se puede deshacer.
      </ConfirmDialog>
    </>
  );
}
