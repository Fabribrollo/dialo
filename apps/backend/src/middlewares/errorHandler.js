export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = status === 500 ? 'Error interno del servidor' : error.message;

  if (status === 500) console.error(error);

  res.status(status).json({ error: { code, message } });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}
