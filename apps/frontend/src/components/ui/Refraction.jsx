import { useId, useLayoutEffect, useState } from 'react';

const esChromium = () => typeof navigator !== 'undefined' && Boolean(navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium'));

function RefractionFilter({ id, w, h, scale }) {
  const borde = h * 0.12;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feFlood floodColor="#000" result="bk" />
        <feFlood floodColor="#fff" x={borde} y={borde} width={w - borde * 2} height={h - borde * 2} result="wh" />
        <feMerge result="box"><feMergeNode in="bk" /><feMergeNode in="wh" /></feMerge>
        <feGaussianBlur in="box" stdDeviation={h * 0.16} result="soft" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 0 1 -2 0 2 -1 0 1" divisor="1" bias="0.5" preserveAlpha="true" edgeMode="duplicate" result="gx" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 -2 -1 0 0 0 1 2 1" divisor="1" bias="0.5" preserveAlpha="true" edgeMode="duplicate" result="gy" />
        <feColorMatrix in="gx" type="matrix" values="1.6 0 0 0 -0.3  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rx" />
        <feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  0 1.6 0 0 -0.3  0 0 0 0 0  0 0 0 1 0" result="ry" />
        <feComposite in="rx" in2="ry" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export function useRefraction({ scale, backdrop }) {
  const [el, setEl] = useState(null);
  const id = `rf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState(null);

  useLayoutEffect(() => {
    if (!el || !esChromium() || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  useLayoutEffect(() => {
    if (!el || !size?.w) return undefined;
    el.style.backdropFilter = `url(#${id}) ${backdrop}`;
    return () => { el.style.backdropFilter = ''; };
  }, [el, size, id, backdrop]);

  return [setEl, size?.w ? <RefractionFilter id={id} w={size.w} h={size.h} scale={scale} /> : null];
}
