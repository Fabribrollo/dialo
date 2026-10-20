import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { EVENTS } from '../constants/events.js';
import * as service from '../services/invitationsService.js';
import { clearPendingInvitation, validInvitationCode } from '../utils-invitations.js';
import CommunityImage from '../components/communities/CommunityImage.jsx';

const ERRORS = {
  INVITATION_NOT_FOUND: 'La invitación no existe o el enlace es incorrecto.',
  INVITATION_REVOKED: 'La invitación fue revocada. Pedí un enlace nuevo a la comunidad.',
  INVITATION_EXPIRED: 'La invitación venció. Pedí un enlace nuevo a la comunidad.',
  INVITATION_EXHAUSTED: 'La invitación alcanzó su máximo de usos. Pedí un enlace nuevo a la comunidad.',
  COMMUNITY_NOT_FOUND: 'La comunidad ya no está disponible.',
};

export default function InvitationPage() {
  const { codigo } = useParams();
  const valid = validInvitationCode(codigo);
  const [result, setResult] = useState({ codigo: null, comunidad: null, error: null });
  const [busy, setBusy] = useState(false), [acceptError, setAcceptError] = useState('');
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
    navigate('/comunidades', { replace: true, state: { notice: 'No ingresaste a la comunidad.' } });
  }
  return <section className="page-container communities-page invitation-preview">
    <header className="page-heading"><h1>Invitación a comunidad</h1></header>
    {!valid ? <p role="alert">El enlace de invitación es inválido.</p> : !current ? <p role="status">Cargando invitación…</p> :
      current.error ? <div className="community-empty"><p role="alert">{ERRORS[current.error.code] || current.error.message || 'No se pudo consultar la invitación.'}</p>
        {![400, 401, 404, 410].includes(current.error.status) && <button type="button" onClick={reload}>Reintentar</button>}</div> : <>
        <div className="community-overview"><CommunityImage nombre={current.comunidad.nombre} url={current.comunidad.imagenUrl} large />
          <div><h2>{current.comunidad.nombre}</h2><p>{current.comunidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'} · {current.comunidad.cantidadIntegrantes} {current.comunidad.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}</p></div></div>
        {current.comunidad.esIntegrante ? <><p>Ya sos integrante de esta comunidad.</p>
          <Link className="button-link" to={`/comunidades/${current.comunidad.id}`}>Abrir comunidad</Link></> : <>
          <p>Ingresarás como integrante si aceptás la invitación.</p>
          {acceptError && <p role="alert" className="notice error">{acceptError}</p>}
          <div className="community-actions"><button type="button" disabled={busy} onClick={accept}>{busy ? 'Ingresando…' : 'Aceptar invitación'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={reject}>Rechazar</button></div>
        </>}
      </>}
    {!busy && <Link className="community-back invitation-back" to="/comunidades">Volver a comunidades</Link>}
  </section>;
}
