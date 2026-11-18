import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { EVENTS } from '../constants/events.js';
import * as service from '../services/invitationsService.js';
import { clearPendingInvitation, validInvitationCode } from '../utils/invitations.js';
import Button from '../components/ui/Button.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import { initials } from '../components/ui/Avatar.jsx';
import '../styles/invitationPage.css';

const ERRORS = {
  INVITATION_NOT_FOUND: 'La invitación no existe o el enlace es incorrecto.',
  INVITATION_REVOKED: 'La invitación fue revocada. Pedí un enlace nuevo a la comunidad.',
  INVITATION_EXPIRED: 'La invitación venció. Pedí un enlace nuevo a la comunidad.',
  COMMUNITY_BANNED: 'Tu acceso a esta comunidad está bloqueado.',
  INVITATION_EXHAUSTED: 'La invitación alcanzó su máximo de usos. Pedí un enlace nuevo a la comunidad.',
  COMMUNITY_NOT_FOUND: 'La comunidad ya no está disponible.',
};

export default function InvitationPage() {
  const { codigo } = useParams();
  const valid = validInvitationCode(codigo);
  const [result, setResult] = useState({ codigo: null, comunidad: null, error: null });
  const [busy, setBusy] = useState(false), [acceptError, setAcceptError] = useState(''), [rejected, setRejected] = useState(false);
  const request = useRef(0), pending = useRef(false), mounted = useRef(false), activeCode = useRef(codigo), preview = useRef(null);
  const lifecycle = useRef(0);
  const { remember } = useCommunities();
  const socket = useSocket(), navigate = useNavigate();
  activeCode.current = codigo;
  const reload = useCallback(async () => {
    if (!valid || pending.current) return;
    const number = ++request.current;
    try {
      const { comunidad } = await service.previewInvitation(codigo);
      if (mounted.current && number === request.current) {
        preview.current = comunidad;
        setResult({ codigo, comunidad, error: null });
      }
    } catch (error) {
      if (mounted.current && number === request.current) {
        preview.current = null;
        setResult({ codigo, comunidad: null, error });
      }
    }
  }, [codigo, valid]);
  useEffect(() => {
    mounted.current = true; pending.current = false; preview.current = null;
    lifecycle.current++;
    setBusy(false); setAcceptError(''); clearPendingInvitation();
    reload();
    return () => { mounted.current = false; request.current++; lifecycle.current++; };
  }, [reload]);
  useEffect(() => {
    const refresh = () => reload();
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    const joined = ({ comunidad }) => {
      if (preview.current?.id !== comunidad.id) return;
      request.current++;
      preview.current = { ...comunidad, esIntegrante: true };
      setResult({ codigo, comunidad: preview.current, error: null });
    };
    const deleted = ({ idComunidad }) => {
      if (preview.current?.id !== idComunidad) return;
      request.current++; preview.current = null;
      setResult({ codigo, comunidad: null, error: { code: 'COMMUNITY_NOT_FOUND', status: 404 } });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    socket?.on('connect', refresh);
    socket?.on(EVENTS.COMMUNITY_NEW, joined);
    socket?.on(EVENTS.COMMUNITY_UPDATED, refresh);
    socket?.on(EVENTS.COMMUNITY_DELETED, deleted);
    socket?.on(EVENTS.COMMUNITY_LEFT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
      socket?.off('connect', refresh); socket?.off(EVENTS.COMMUNITY_NEW, joined);
      socket?.off(EVENTS.COMMUNITY_UPDATED, refresh); socket?.off(EVENTS.COMMUNITY_DELETED, deleted);
      socket?.off(EVENTS.COMMUNITY_LEFT, refresh);
    };
  }, [socket, codigo, reload]);

  const current = result.codigo === codigo ? result : null;
  async function accept() {
    if (!valid || pending.current || !current?.comunidad) return;
    pending.current = true; request.current++; setBusy(true); setAcceptError('');
    const submittedCode = codigo;
    const version = lifecycle.current;
    try {
      const { comunidad } = await service.acceptInvitation(codigo);
      if (!mounted.current || activeCode.current !== submittedCode || version !== lifecycle.current) return;
      remember(comunidad); clearPendingInvitation();
      navigate(`/comunidades/${comunidad.id}`, { replace: true, state: { notice: 'Ya sos integrante de la comunidad.' } });
    } catch (error) {
      if (!mounted.current || activeCode.current !== submittedCode || version !== lifecycle.current) return;
      // El evento autenticado puede confirmar el ingreso aunque se pierda la
      // respuesta HTTP. No volver a consumir una invitación de un solo uso.
      if (preview.current?.esIntegrante) {
        navigate(`/comunidades/${preview.current.id}`, { replace: true, state: { notice: 'Ya sos integrante de la comunidad.' } });
      } else if (ERRORS[error.code]) {
        preview.current = null;
        setResult({ codigo, comunidad: null, error });
      } else setAcceptError(error.message);
    } finally {
      if (mounted.current && activeCode.current === submittedCode && version === lifecycle.current) { pending.current = false; setBusy(false); }
    }
  }
  function reject() {
    if (pending.current) return;
    clearPendingInvitation();
    setRejected(true);
  }
  const comunidad = current?.comunidad;
  const integrantes = comunidad ? `${comunidad.cantidadIntegrantes} ${comunidad.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}` : '';
  const code = current?.error?.code;
  const errorTitle = !valid || code === 'INVITATION_NOT_FOUND' ? 'No encontramos esta invitación'
    : ['INVITATION_EXPIRED', 'INVITATION_REVOKED'].includes(code) ? 'Esta invitación ya no está activa'
      : ERRORS[code] || current?.error?.message || 'No se pudo consultar la invitación.';
  const errorText = !valid || code === 'INVITATION_NOT_FOUND' ? 'Revisá que el enlace esté completo.'
    : ['INVITATION_EXPIRED', 'INVITATION_REVOKED'].includes(code) ? 'Venció o la revocaron. Pedí un enlace nuevo a quien te la pasó.'
      : code === 'INVITATION_EXHAUSTED' ? 'Pedí un enlace nuevo a quien te la pasó.' : '';

  return <div className="iv">
    <div className="iv-art" aria-hidden="true">
      <span className="iv-ring iv-ring-1" />
      <span className="iv-ring iv-ring-2" />
      {comunidad && <span className="iv-tile">{comunidad.imagenUrl ? <img src={comunidad.imagenUrl} alt="" /> : initials(comunidad.nombre)}</span>}
    </div>
    <div className="iv-body">
      {!valid || (current && !comunidad) ? <div className="iv-in iv-state">
        <span className="iv-state-ic"><Icon name="enlace" size={26} stroke={1.9} /></span>
        <h1 className="dsp iv-h-sm" role="alert">{errorTitle}</h1>
        {errorText && <span className="iv-sub">{errorText}</span>}
        <div className="iv-actions">
          {valid && ![400, 401, 404, 410].includes(current.error.status) && <Button className="iv-btn" onClick={reload}>Reintentar</Button>}
          <Button variant="secundario" className="iv-btn" onClick={() => navigate('/')}>Ir al inicio</Button>
        </div>
      </div> : !current ? <span className="iv-loading" role="status"><Spinner size={17} />Cargando…</span>
        : rejected ? <div className="iv-in iv-state">
          <h1 className="dsp iv-h-md">Rechazaste la invitación</h1>
          <span className="iv-sub">Si cambiás de idea, volvé a abrir el enlace mientras siga activo.</span>
          <Button variant="secundario" className="iv-btn" onClick={() => navigate('/')}>Ir al inicio</Button>
        </div>
        : comunidad.esIntegrante ? <div className="iv-in iv-state">
          <h1 className="dsp iv-h-md">Ya sos integrante de {comunidad.nombre}</h1>
          <span className="iv-sub">{integrantes}</span>
          <Link className="btn ac pr iv-btn" to={`/comunidades/${comunidad.id}`}>Abrir comunidad</Link>
        </div>
          : <div className="iv-in iv-state">
            <h1 className="dsp iv-h">{comunidad.nombre}</h1>
            <span className="iv-count">{integrantes}</span>
            <span className="iv-sub">Te invitaron a unirte.</span>
            {acceptError && <Notice tone="error" title={acceptError} />}
            <div className="iv-actions">
              <Button className="iv-btn" loading={busy} disabled={busy} onClick={accept}>{busy ? 'Entrando…' : 'Aceptar'}</Button>
              <Button variant="secundario" className="iv-btn" disabled={busy} onClick={reject}>Rechazar</Button>
            </div>
          </div>}
    </div>
  </div>;}
