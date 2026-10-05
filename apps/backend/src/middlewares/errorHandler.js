const UNIQUE_CONFLICTS = {
  SolicitudAmistad: { code: 'REQUEST_EXISTS', message: 'Ya hay una solicitud pendiente entre ustedes' },
  Amistad: { code: 'ALREADY_FRIENDS', message: 'Ya son amigos' },
  ConversacionPrivada: { code: 'CONVERSATION_EXISTS', message: 'La conversación ya existe' },
};

function uniqueConflict(error) {
  const target = [].concat(error.meta?.target ?? []).join(',');
  const model = error.meta?.modelName;

  if (model === 'Usuario' && /nombre_?usuario/i.test(target)) {
    return { code: 'USERNAME_TAKEN', message: 'El nombre de usuario ya está en uso' };
  }
  if (model === 'Usuario' && /correo/i.test(target)) {
    return { code: 'EMAIL_TAKEN', message: 'El correo ya está registrado' };
  }
  if (/solicitud_pendiente_unica/.test(target)) return UNIQUE_CONFLICTS.SolicitudAmistad;

  return UNIQUE_CONFLICTS[model] ?? { code: 'CONFLICT', message: 'El recurso ya existe' };
}

function normalize(error) {
  if (error.code === 'P2002') return { status: 409, ...uniqueConflict(error) };
  if (error.type === 'entity.parse.failed') return { status: 400, code: 'VALIDATION_ERROR', message: 'El body no es un JSON válido' };
  if (error.type === 'entity.too.large') return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'El body es demasiado grande' };
  if (error.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'El recurso no existe' };
  return {
    status: error.status || 500,
    code: error.status ? error.code : 'INTERNAL_ERROR',
    message: error.message,
    details: error.details,
  };
}

export function errorHandler(error, req, res, next) {
  const { status, code, message, details } = normalize(error);

  if (status === 500) {
    console.error(error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
  }

  res.status(status).json({ error: { code, message, ...(details && { details }) } });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}
