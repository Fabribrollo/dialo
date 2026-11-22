export function parseSearch(value){const match=/(?:^|\s)fecha:(\d{4}-\d{2}-\d{2})(?=\s|$)/.exec(value);return {text:match?value.replace(match[0],' ').trim():value.trim(),fecha:match?.[1]??''};}
export function buildSearch(v){return [v.text,v.fecha?`fecha:${v.fecha}`:''].filter(Boolean).join(' ');}
