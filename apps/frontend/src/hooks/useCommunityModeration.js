import { useCallback, useEffect, useRef, useState } from 'react';
import * as service from '../services/communityModerationService.js';

export function useCommunityModeration(id, enabled = true) {
  const [result, setResult] = useState({ id: null, moderacion: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const number = ++request.current;
    if (!enabled) return;
    service.getCommunityModeration(id).then(({ moderacion }) => {
      if (number === request.current) setResult({ id, moderacion, error: null });
    }).catch((error) => {
      if (number === request.current) setResult({ id, moderacion: null, error });
    });
    return () => { request.current++; };
  }, [id, enabled, attempt]);

  const save = useCallback(async (datos) => {
    const { moderacion } = await service.replaceCommunityModeration(id, datos);
    request.current++;
    setResult({ id, moderacion, error: null });
    return moderacion;
  }, [id]);

  return {
    moderacion: result.id === id ? result.moderacion : null,
    error: result.id === id ? result.error : null,
    loading: enabled && result.id !== id,
    reload, save,
  };
}
