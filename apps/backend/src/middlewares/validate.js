import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

z.config(z.locales.es());

const PARTS = ['body', 'params', 'query'];

export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ campo: issue.path.join('.') || part, message: issue.message });
        }
      }
    }

    if (details.length) throw new AppError(400, 'VALIDATION_ERROR', 'Hay datos inválidos', details);

    req.validated = validated;
    next();
  };
}
