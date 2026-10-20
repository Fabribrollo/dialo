import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { getCommunity } from '../services/communitiesService.js';

export function useCommunity(id) {
  const { revision, removed } = useCommunities();
  const [result, setResult] = useState({ id: null, comunidad: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const valid = Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
  const lost = removed.has(id);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const number = ++request.current;
    if (!valid || lost) return;
    getCommunity(id).then(({ comunidad }) => {
      if (number === request.current) setResult({ id, comunidad, error: null });
    }).catch((error) => {
      if (number !== request.current) return;
      setResult((old) => ({
        id,
        comunidad: old.id === id && ![401, 403, 404].includes(error.status) ? old.comunidad : null,
        error,
      }));
    });
    return () => { request.current++; };
  }, [id, valid, lost, revision, attempt]);

  return {
    comunidad: result.id === id && !lost ? result.comunidad : null,
    error: result.id === id ? result.error : null,
    loading: valid && !lost && result.id !== id,
    valid, lost, reload,
  };
}
