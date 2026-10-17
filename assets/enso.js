/* Ensō (圆相) brush-stroke geometry. Deterministic for a given seed.
   Returns SVG path data in a coordinate system centred on (0, 0) with radius ≈ r:
   one body ribbon (the loaded brush), a set of bristle ribbons for the dry-brush
   tail (飞白), and the centreline used as the drawing mask. */
(function (root) {
  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function build(o = {}) {
    const rnd = rng(o.seed || 11);
    const R = o.r || 100, W = o.width || 26;
    const a0 = ((o.start ?? 198) * Math.PI) / 180, sweep = ((o.sweep ?? 326) * Math.PI) / 180;
    const ph = Array.from({ length: 12 }, () => rnd() * Math.PI * 2);
    const wave = (t, k) => 0.55 * Math.sin(t * 9.4 + ph[k]) + 0.3 * Math.sin(t * 21.7 + ph[k + 1]) + 0.15 * Math.sin(t * 47.1 + ph[k + 2]);
    const rad = (t) => R * (1 + 0.05 * t * t) + 2.2 * wave(t, 0);
    const wid = (t) => {
      const cap = 0.035;
      const press = t < cap ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - t / cap, 2))) : 1;
      const body = 1.08 - 0.5 * Math.pow(t, 1.15) + 0.2 * Math.exp(-Math.pow((t - 0.05) / 0.06, 2));
      const tail = t > 0.82 ? Math.pow(Math.max(0, 1 - (t - 0.82) / 0.18), 0.7) : 1;
      return W * press * body * tail * (1 + 0.1 * wave(t, 3));
    };
    const pt = (t, off) => {
      const a = a0 + sweep * t, r = rad(t) + off;
      return [r * Math.cos(a), r * Math.sin(a)];
    };
    const f = (p) => p[0].toFixed(2) + " " + p[1].toFixed(2);
    // A ribbon between lateral offsets lo(t) and hi(t), measured in brush widths (-0.5 … 0.5).
    const ribbon = (t0, t1, lo, hi, n) => {
      const outer = [], inner = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + ((t1 - t0) * i) / n, w = wid(t);
        outer.push(pt(t, w * hi(t)));
        inner.push(pt(t, w * lo(t)));
      }
      return "M" + outer.map(f).join("L") + "L" + inner.reverse().map(f).join("L") + "Z";
    };

    const body = ribbon(0, 0.68, (t) => -0.5 - 0.035 * wave(t, 5), (t) => 0.5 + 0.035 * wave(t, 4), 220);

    const K = o.bristles || 11, bristles = [];
    for (let k = 0; k < K; k++) {
      const u = -0.46 + (0.92 * k) / (K - 1) + (rnd() - 0.5) * 0.03;
      const h0 = (0.5 / K) * (1.15 + rnd() * 0.5);
      const end = Math.min(0.998, 0.998 - 0.2 * Math.pow(Math.abs(u) * 2, 1.4) * (0.45 + rnd()));
      // break the bristle where the ink runs dry
      const cuts = [0.6];
      const nGaps = rnd() < 0.35 ? 0 : rnd() < 0.6 ? 1 : 2;
      for (let g = 0; g < nGaps; g++) {
        const at = 0.74 + rnd() * Math.max(0.01, end - 0.8), len = 0.008 + rnd() * 0.022;
        cuts.push(at, Math.min(end, at + len));
      }
      cuts.push(end);
      const sorted = cuts.slice(1, -1).sort((a, b) => a - b);
      const segs = [0.6, ...sorted, end];
      for (let s = 0; s + 1 < segs.length; s += 2) {
        const t0 = segs[s], t1 = segs[s + 1];
        if (t1 - t0 < 0.006) continue;
        const h = (t) => h0 * Math.min(1, (end - t) / 0.05 + 0.05) * Math.min(1, (t - t0) / 0.012 + (s === 0 ? 1 : 0.15)) * Math.min(1, (t1 - t) / 0.012 + (t1 === end ? 1 : 0.15));
        bristles.push(ribbon(t0, t1, (t) => u - h(t), (t) => u + h(t), Math.max(8, Math.round((t1 - t0) * 260))));
      }
    }

    const cl = [];
    for (let i = 0; i <= 160; i++) cl.push(pt(i / 160, 0));
    const centre = "M" + cl.map(f).join("L");
    return { body, bristles, centre, extent: R * 1.05 + W };
  }

  const api = { build };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Enso = api;
})(typeof window !== "undefined" ? window : globalThis);
