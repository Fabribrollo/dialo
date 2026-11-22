import BlockedUsers from '../components/BlockedUsers.jsx';
import AppearanceSettings from '../components/AppearanceSettings.jsx';
import {useGuardedAction} from '../context/UnsavedChangesContext.jsx';
import DeviceSettings from '../components/DeviceSettings.jsx';
import { useState } from 'react';
import ProfileForm from '../components/ProfileForm.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import { useAuth } from '../hooks/useAuth.js';
import '../styles/page.css';

export default function ProfilePage() {
  const { logout } = useAuth();
  const guard=useGuardedAction();
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState(false);

  async function salir() {
    setSaliendo(true);
    setError(false);
    try {
      await logout();
    } catch {
      setError(true);
      setSaliendo(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head page-head-line">
        <h1 className="dsp">Mi perfil</h1>
        <Button variant="secundario" loading={saliendo} onClick={()=>guard(salir)}>
          {!saliendo && <Icon name="cerrarSesion" size={16} stroke={2} />}Cerrar sesión
        </Button>
      </header>
      <div className="page-body page-body-profile">
        {error && <Notice tone="error" title="No se pudo cerrar la sesión" actionLabel="Reintentar" onAction={salir}>Revisá tu conexión y probá de nuevo.</Notice>}
        <ProfileForm /><DeviceSettings /><AppearanceSettings/><BlockedUsers/>
      </div>
    </div>
  );
}
