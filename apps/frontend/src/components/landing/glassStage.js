// Escena WebGL de la landing: una pieza de vidrio que se transforma sobre las palabras.
export const WORDS = ['Escribí', 'Hablá', 'Mostrá', 'Juntate', 'Empezá'];
const PHASES = [[0.1, 0.16], [0.26, 0.32], [0.42, 0.48], [0.58, 0.64], [0.74, 0.8]];
export function phaseAt(p) {
  for (var i = 0; i < 5; i++) {
    if (p < PHASES[i][0]) return [i, 0];
    if (p < PHASES[i][1]) return [i, (p - PHASES[i][0]) / (PHASES[i][1] - PHASES[i][0])];
  }
  return [5, 0];
}
const FRAG = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uK;
uniform float uT;
uniform vec3 uAcc;
uniform sampler2D uWords;
uniform float uS;
uniform float uDrop;
uniform vec2 uHero;
const vec3 BG = vec3(0.925, 0.929, 0.941);
const float PZ = -0.35;
const float HH = 1.0875;
float E;
float SPIN;
float AMT;
float OY;
vec2 CEN;
mat3 R;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCaps(vec3 p, float h, float r) { p.x -= clamp(p.x, -h, h); return length(p) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float shape(float k, vec3 p) {
  if (k < 0.5) {
    p.xy = rot(-0.18) * p.xy;
    p.yz = rot(0.2) * p.yz;
    p.xz = rot(-0.32) * p.xz;
    return sdRBox(p, vec3(0.4, 0.4, 0.085), 0.085) - 0.06;
  }
  if (k < 1.5) {
    float d = sdRBox(p - vec3(0.0, 0.04, 0.0), vec3(0.62, 0.22, 0.11), 0.11);
    vec3 q = p - vec3(-0.44, -0.2, 0.0);
    q.xy = rot(0.7) * q.xy;
    float t = sdRBox(q, vec3(0.1, 0.1, 0.075), 0.075);
    return smin(d, t, 0.07);
  }
  if (k < 2.5) {
    return sdCaps(p * vec3(1.0, 1.0, 1.8), 0.44, 0.19) / 1.8;
  }
  if (k < 3.5) {
    float d = sdRBox(p, vec3(0.54, 0.31, 0.05), 0.05);
    float bul = 1.0 - clamp(length(p.xy / vec2(0.56, 0.33)), 0.0, 1.0);
    return d - 0.05 * bul * bul;
  }
  if (k < 4.5) {
    p.z *= 1.6;
    float d = length(p) - 0.2;
    for (int i = 0; i < 5; i++) {
      float a = float(i) * 1.2566 + uTime * 0.25;
      vec3 c = vec3(cos(a) * 0.4, sin(a) * 0.4 * 0.62, sin(a) * 0.12);
      d = smin(d, length(p - c) - 0.135, 0.16);
    }
    return d / 1.6;
  }
  return sdRBox(p, vec3(0.56, 0.17, 0.15), 0.15);
}
float map(vec3 p) {
  p.xy -= CEN;
  p.y -= sin(uTime * 0.8) * 0.018 * uS;
  p = R * p / uS;
  float a = shape(uK, p) * uS;
  if (uT <= 0.0) return a;
  float b = shape(min(uK + 1.0, 5.0), p) * uS;
  return mix(a, b, E);
}
vec3 nor(vec3 p) {
  vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
vec3 cell(float i, vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return BG;
  return texture(uWords, vec2(uv.x, (5.0 - i + uv.y) / 6.0)).rgb;
}
vec3 words(vec2 q) {
  float asp = uRes.x / uRes.y;
  vec2 uv = vec2(q.x / (2.0 * HH * asp) + 0.5, q.y / (2.0 * HH) + 0.5);
  vec3 a = cell(uK, uv - vec2(0.0, E * 0.22));
  if (uT <= 0.0) return a;
  vec3 b = cell(min(uK + 1.0, 5.0), uv + vec2(0.0, (1.0 - E) * 0.22));
  float wa = 1.0 - smoothstep(0.05, 0.5, E), wb = smoothstep(0.5, 0.95, E);
  return BG + (a - BG) * wa + (b - BG) * wb;
}
vec3 backdrop(vec2 q, float near) {
  vec3 c = words(q);
  if (near > 0.5) {
    vec3 L = normalize(vec3(0.08, 0.34, 1.0));
    vec3 ps = vec3(q, PZ) + L * (-PZ / L.z);
    float d = map(ps);
    float sh = smoothstep(-0.1 * uS, 0.5 * uS, d);
    c *= mix(0.86, 1.0, sh);
    float core = exp(-max(d + 0.06 * uS, 0.0) * 14.0 / uS) * smoothstep(-0.25 * uS, 0.0, d);
    c += mix(vec3(1.0), uAcc, 0.55) * core * 0.16;
  }
  return c;
}
vec3 env(vec3 d) {
  vec3 c = mix(vec3(0.80, 0.81, 0.85), vec3(1.0), smoothstep(-0.3, 0.8, d.y));
  vec3 l1 = normalize(vec3(-0.55 + uMouse.x * 0.5, 0.65 - uMouse.y * 0.3, 0.55));
  c += vec3(1.4) * smoothstep(0.86, 0.97, dot(d, l1));
  c += vec3(0.7) * smoothstep(0.9, 0.99, dot(d, normalize(vec3(0.8, 0.1, 0.6))));
  c = mix(c, c * mix(vec3(1.0), uAcc * 1.6, 0.25), smoothstep(0.2, -0.6, d.y));
  return c;
}
vec3 toPlane(vec3 p, vec3 d) {
  if (d.z > -0.05) return env(d);
  float t = (PZ - p.z) / d.z;
  return backdrop(p.xy + d.xy * t, 0.0);
}
void main() {
  E = smoothstep(0.0, 1.0, uT);
  SPIN = E * 6.28318;
  AMT = uK > 4.5 ? 1.0 : (uK > 3.5 ? E : 0.0);
  OY = mix(0.0, uDrop, AMT);
  CEN = uK < 0.5 ? mix(uHero, vec2(0.0), E) : vec2(0.0, OY);
  float mv = 1.0 - AMT;
  float ry = (uMouse.x * 0.42 + sin(uTime * 0.4) * 0.07) * mv + SPIN;
  float rx = (-uMouse.y * 0.32 + sin(uTime * 0.5) * 0.05) * mv;
  float cy = cos(ry), sy = sin(ry), cx = cos(rx), sx = sin(rx);
  R = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0;
  vec3 ro = vec3(0.0, 0.0, 4.0);
  vec3 rd = normalize(vec3(uv, -4.0));
  float tp = (PZ - ro.z) / rd.z;
  vec2 qp = ro.xy + rd.xy * tp;
  vec3 oc = ro - vec3(CEN, 0.0);
  float b = dot(oc, rd), cc = dot(oc, oc) - 0.92 * 0.92 * uS * uS, h = b * b - cc;
  vec3 col;
  float near = step(length(qp - CEN), 2.8);
  if (h < 0.0) {
    col = backdrop(qp, near);
  } else {
    float t = -b - sqrt(h), tmax = -b + sqrt(h), hit = 0.0;
    for (int i = 0; i < 90; i++) {
      float d = map(ro + rd * t);
      if (d < 0.0006) { hit = 1.0; break; }
      t += d;
      if (t > tmax) break;
    }
    if (hit < 0.5) {
      col = backdrop(qp, near);
    } else {
      vec3 p = ro + rd * t, n = nor(p);
      float fre = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
      vec3 d = refract(rd, n, 1.0 / 1.12);
      vec3 q = p - n * 0.006;
      float s = 0.0;
      for (int i = 0; i < 48; i++) {
        float hh = -map(q + d * s);
        if (hh < 0.0008) break;
        s += max(hh, 0.006);
        if (s > 2.0) break;
      }
      vec3 pe = q + d * s, ne = nor(pe);
      vec3 refr;
      vec3 dg = refract(d, -ne, 1.12);
      if (dot(dg, dg) < 0.01) {
        refr = env(reflect(d, -ne)) * 0.7;
      } else {
        vec3 dr = refract(d, -ne, 1.105), db = refract(d, -ne, 1.14);
        refr.r = toPlane(pe, dot(dr, dr) < 0.01 ? dg : dr).r;
        refr.g = toPlane(pe, dg).g;
        refr.b = toPlane(pe, dot(db, db) < 0.01 ? dg : db).b;
      }
      vec3 tint = mix(vec3(0.985, 0.985, 1.0), mix(vec3(1.0), uAcc, 0.62), AMT);
      refr *= pow(tint, vec3(1.0 + s * 2.5));
      col = mix(refr, env(reflect(rd, n)), fre);
      vec3 l1 = normalize(vec3(-0.5 + uMouse.x * 0.8, 0.7 - uMouse.y * 0.5, 0.8));
      col += vec3(1.0) * pow(max(dot(reflect(rd, n), l1), 0.0), 90.0) * 0.9;
      col += vec3(1.0) * pow(max(dot(reflect(rd, n), normalize(vec3(0.7, -0.2, 0.7))), 0.0), 40.0) * 0.18;
      col *= 1.0 - 0.1 * pow(1.0 - abs(dot(-rd, n)), 3.0);
    }
  }
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.012;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
export function createGlassStage(logic) {
  var calm = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  var view = null, paint = null, buf = null, gl = null, U = {}, tex = null, raf = 0, shown = true, dead = false, away = 0;
  var aspA = 0, mx = 0, my = 0, time = 4, last = 0, scale = 1, slow = 0, drawnAcc = '', fontOk = false, A = null, wc = null;
  function fail() { dead = true; halt(); if (logic.noGL) logic.noGL(); }
  function part(kind, src) {
    var s = gl.createShader(kind);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function wake() {
    if (gl && !gl.isContextLost()) return true;
    if (dead) return false;
    buf = document.createElement('canvas');
    gl = buf.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) { fail(); return false; }
    var v = part(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2(gl_VertexID<<1&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}');
    var f = v && part(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nout vec4 outColor;\n' + FRAG);
    if (!f) { fail(); return false; }
    var pr = gl.createProgram();
    gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); fail(); return false; }
    gl.useProgram(pr);
    ['uRes', 'uTime', 'uMouse', 'uK', 'uT', 'uAcc', 'uWords', 'uS', 'uDrop', 'uHero'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(U.uWords, 0);
    drawnAcc = '';
    atlas();
    return true;
  }
  function heroCfg() {
    var h = logic.hero || {};
    return { lines: h.lines || ['Donde se junta', 'tu gente'], left: h.left !== false, tx: h.tx == null ? 0.065 : h.tx, ty: h.ty == null ? 400 : h.ty, wf: h.wf || 0.58, max: h.max || 230, x: h.x == null ? 1.0 : h.x, y: h.y == null ? 0.0 : h.y };
  }
  function heroPos(asp) {
    var h = heroCfg();
    return [h.x * Math.min(1, asp / 1.6), h.y];
  }
  function accent() { return logic.accent || '#6A3CF5'; }
  function rgb(c) {
    var g = document.createElement('canvas').getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    var d = g.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  }
  function atlas() {
    var acc = accent();
    var asp = view && view.clientHeight ? view.clientWidth / view.clientHeight : 1.6;
    var key = acc + fontOk + asp.toFixed(2);
    if (!gl || drawnAcc === key) return;
    drawnAcc = key; aspA = asp;
    var W = Math.max(200, Math.min(3200, Math.round(1000 * asp)));
    var c = document.createElement('canvas');
    c.width = W; c.height = 6000;
    var g = c.getContext('2d');
    g.fillStyle = '#ECEDF0'; g.fillRect(0, 0, W, 6000);
    g.font = '900 390px "Archivo", system-ui, sans-serif';
    try { g.letterSpacing = '-22px'; } catch (e) {}
    var widest = 1;
    for (var j = 0; j < 5; j++) widest = Math.max(widest, g.measureText(WORDS[j]).width);
    var fs = Math.min(390, 390 * 0.9 * W / widest);
    g.font = '900 ' + fs.toFixed(1) + 'px "Archivo", system-ui, sans-serif';
    try { g.letterSpacing = (-22 * fs / 390).toFixed(1) + 'px'; } catch (e) {}
    g.textAlign = 'center'; g.textBaseline = 'middle';
    A = { W: W, fs: fs };
    for (var i = 0; i < 5; i++) {
      g.fillStyle = '#131316';
      g.fillText(i === 4 && logic.empText ? logic.empText : WORDS[i], W / 2, (i + 1) * 1000 + (logic.wordY || 470));
    }
    var hc = heroCfg(), hl = hc.lines;
    var hp = heroPos(asp), Sh = Math.min(1, asp * 0.95);
    var bx = W * (0.5 + hp[0] / (2 * asp)), by = 1000 * (0.5 - hp[1] / 2), uu = Sh * 500;
    var sx = bx + 0.2 * uu, sy = by + 0.17 * uu, ss = 0.78 * uu;
    g.fillStyle = acc;
    g.beginPath();
    if (g.roundRect) g.roundRect(sx - ss / 2, sy - ss / 2, ss, ss, ss * 0.26); else g.rect(sx - ss / 2, sy - ss / 2, ss, ss);
    g.fill();
    g.fillStyle = '#131316';
    g.font = '900 300px "Archivo", system-ui, sans-serif';
    try { g.letterSpacing = '-16px'; } catch (e) {}
    var hw = 1;
    for (var m = 0; m < hl.length; m++) hw = Math.max(hw, g.measureText(hl[m]).width);
    var hf = Math.min(hc.max, 300 * hc.wf * W / hw);
    g.font = '900 ' + hf.toFixed(1) + 'px "Archivo", system-ui, sans-serif';
    try { g.letterSpacing = (-16 * hf / 300).toFixed(1) + 'px'; } catch (e) {}
    g.textAlign = hc.left ? 'left' : 'center';
    for (var n = 0; n < hl.length; n++) g.fillText(hl[n], hc.left ? W * hc.tx : W / 2, hc.ty + (n - (hl.length - 1) / 2) * hf * 0.98);
    g.textAlign = 'center';
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    U.acc = rgb(acc);
  }
  function drawWord(text) {
    if (!gl || !A || gl.isContextLost()) return;
    if (!wc) wc = document.createElement('canvas');
    if (wc.width !== A.W) { wc.width = A.W; wc.height = 1000; }
    var g = wc.getContext('2d');
    g.fillStyle = '#ECEDF0'; g.fillRect(0, 0, A.W, 1000);
    g.font = '900 ' + A.fs.toFixed(1) + 'px "Archivo", system-ui, sans-serif';
    try { g.letterSpacing = (-22 * A.fs / 390).toFixed(1) + 'px'; } catch (e) {}
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#131316';
    g.fillText(text, A.W / 2, logic.wordY || 470);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, wc);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  function draw(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!calm.matches) time += dt;
    var k = 1 - Math.pow(0.9, dt * 60);
    mx += ((logic.mx || 0) - mx) * k; my += ((logic.my || 0) - my) * k;
    var ph = phaseAt(logic.p || 0);
    var cw = view.clientWidth, ch = view.clientHeight;
    if (!cw || !ch) return;
    if (dt > 0.03) slow++; else if (slow > 0) slow -= 0.25;
    if (slow > 20 && scale > 0.5) { scale *= 0.85; slow = 0; }
    var s = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1.7e6 / (cw * ch))) * scale;
    var w = Math.max(2, Math.round(cw * s)), h = Math.max(2, Math.round(ch * s));
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
    if (Math.abs(cw / ch - aspA) > 0.01) atlas();
    var S = Math.min(1, (cw / ch) * 0.95), drop = logic.drop == null ? -0.64 : logic.drop;
    if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uTime, time);
    gl.uniform2f(U.uMouse, mx, my);
    gl.uniform1f(U.uK, ph[0]);
    gl.uniform1f(U.uT, ph[1]);
    gl.uniform1f(U.uS, S);
    gl.uniform1f(U.uDrop, drop);
    var hp = heroPos(cw / ch);
    gl.uniform2f(U.uHero, hp[0], hp[1]);
    var a = U.acc || [0.42, 0.24, 0.96];
    gl.uniform3f(U.uAcc, a[0], a[1], a[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    paint.drawImage(buf, 0, 0);
    var cta = logic.cta && logic.cta.current;
    if (cta) {
      var u = ch / 2, bw = 2 * 0.56 * S * u * 1.04, bh = 2 * 0.17 * S * u * 1.04, cy = u - (drop + Math.sin(time * 0.8) * 0.018 * S) * u;
      cta.style.width = bw.toFixed(1) + 'px'; cta.style.height = bh.toFixed(1) + 'px';
      cta.style.left = (cw / 2 - bw / 2).toFixed(1) + 'px'; cta.style.top = (cy - bh / 2).toFixed(1) + 'px';
      cta.style.fontSize = Math.max(17, bh * 0.19).toFixed(1) + 'px';
    }
  }
  function tick(now) {
    raf = 0;
    if (!shown || dead) return;
    if (!wake()) return;
    try { draw(now); } catch (e) { console.warn(e); fail(); return; }
    raf = requestAnimationFrame(tick);
  }
  function run() { clearTimeout(away); if (!raf && !dead && view) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function halt() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function sleep() { var x = gl && gl.getExtension('WEBGL_lose_context'); gl = null; if (x) x.loseContext(); }
  var seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(function (es) {
      shown = es[es.length - 1].isIntersecting;
      if (shown) run(); else { halt(); clearTimeout(away); away = setTimeout(sleep, 2000); }
    })
    : { observe: function () {}, disconnect: function () {} };
  function hold(el) {
    seen.disconnect();
    view = el;
    if (el) { paint = el.getContext('2d'); seen.observe(el); run(); } else halt();
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('900 390px "Archivo"').then(function () { fontOk = true; atlas(); }).catch(function () {});
  }
  hold(logic.view.current);
  return {
    update: function () { if (logic.view.current !== view) hold(logic.view.current); atlas(); run(); },
    word: function (t) { drawWord(t); },
    stop: function () { halt(); clearTimeout(away); seen.disconnect(); view = null; sleep(); }
  };
}
