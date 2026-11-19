import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export function useMessageSearch(kind, id, query) {
  const [state, setState] = useState({ items: [], cursor: null, loading: false, error: '', key: '' });
  const request = useRef(0);
  const q = query.trim(), key = `${kind}:${id}:${q}`;
  async function load(cursor) {
    const seq = ++request.current;
    setState((s) => ({ ...s, key, loading: true, error: '' }));
    try {
      const data = await api.get(`/${kind}/${id}/messages/search?q=${encodeURIComponent(q)}${cursor ? '&cursor=' + cursor : ''}`);
      if (seq === request.current) setState((s) => ({ key, items: cursor && s.key === key ? [...s.items, ...data.items] : data.items, cursor: data.nextCursor, loading: false, error: '' }));
    } catch (e) { if (seq === request.current) setState({ key, items: [], cursor: null, loading: false, error: e.message }); }
  }
  useEffect(() => {
    request.current++;
    if (q.length < 2) { setState({ key, items: [], cursor: null, loading: false, error: '' }); return; }
    const timer = setTimeout(() => load(), 300);
    return () => { clearTimeout(timer); request.current++; };
  }, [key]);
  return { ...state, items: state.key === key ? state.items : [], active: q.length >= 2, more: () => load(state.cursor) };
}
