import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommunities } from '../context/CommunitiesContext.jsx';

// Listas de integrantes/invitaciones: reconsulta ante cambios de membresía,
// reconexión o foco, sin mezclar respuestas de distintas comunidades.
export function useCommunityCollection(id, load, enabled = true) {
  const { revision, removed } = useCommunities();
  const [result, setResult] = useState({ id: null, items: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const mounted = useRef(false);
  const allowed = enabled && Number.isInteger(id) && id > 0 && id <= 2_147_483_647 && !removed.has(id);
  const reload = useCallback(async () => {
    const number = ++request.current;
    if (!allowed || !mounted.current) return;
    setRefreshing(true);
    try {
      const data = await load(id);
      if (mounted.current && number === request.current) setResult({ id, items: data.items, error: null });
    } catch (error) {
      if (mounted.current && number === request.current) setResult((old) => ({
        id, items: old.id === id && ![401, 403, 404].includes(error.status) ? old.items : [], error,
      }));
    } finally {
      if (mounted.current && number === request.current) setRefreshing(false);
    }
  }, [id, load, allowed]);
  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; request.current++; };
  }, [reload, revision]);
  const mutate = useCallback((update) => {
    if (!mounted.current) return;
    request.current++;
    setRefreshing(false);
    setResult((old) => ({ id, items: update(old.id === id ? old.items : []), error: null }));
  }, [id]);
  return {
    items: allowed && result.id === id ? result.items : [],
    error: allowed && result.id === id ? result.error : null,
    loading: allowed && result.id !== id,
    refreshing, reload, mutate,
  };
}
