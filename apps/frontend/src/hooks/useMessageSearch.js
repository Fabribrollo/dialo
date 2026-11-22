import {parseSearch} from '../utils/searchFilters.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export function useMessageSearch(kind, id, query) {
  const [state, setState] = useState({ items: [], cursor: null, loading: false, error: '', key: '' });
  const request = useRef(0);
  const filters=parseSearch(query),q=filters.text,extra=filters.fecha?new URLSearchParams({desde:filters.fecha,hasta:filters.fecha,desfase:String(new Date(filters.fecha+'T00:00:00').getTimezoneOffset())}).toString():'',active=q.length>=2||Boolean(extra),key=`${kind}:${id}:${query}`;
  async function load(cursor) {
    const seq = ++request.current;
    setState((s) => ({ ...s, key, loading: true, error: '' }));
    try {
      const data = await api.get(`/${kind}/${id}/messages/search?q=${encodeURIComponent(q)}${extra?'&'+extra:''}${cursor ? '&cursor=' + cursor : ''}`);
      if (seq === request.current) setState((s) => ({ key, items: cursor && s.key === key ? [...s.items, ...data.items] : data.items, cursor: data.nextCursor, loading: false, error: '' }));
    } catch (e) { if (seq === request.current) setState({ key, items: [], cursor: null, loading: false, error: e.message }); }
  }
  useEffect(() => {
    request.current++;
    if (!active) { setState({ key, items: [], cursor: null, loading: false, error: '' }); return; }
    const timer = setTimeout(() => load(), 300);
    return () => { clearTimeout(timer); request.current++; };
  }, [key]);
  return { ...state, items: state.key === key ? state.items : [], active, more: () => load(state.cursor) };
}
