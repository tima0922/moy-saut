export const GRAPHICS = {
  ultra: { pixels: 3_700_000, dpr: 1.5, far: 185, shadows: true, shadowMs: 1000/20 },
  balanced: { pixels: 1_100_000, dpr: 1, far: 160 },
  integrated: { pixels: 880_000, dpr: 1, far: 115, lite: true },
  performance: { pixels: 520_000, dpr: .85, far: 115, lite: true },
  minimum: { pixels: 260_000, dpr: .65, far: 85, lite: true },
};

const AUTO_LEVELS = ['minimum', 'performance', 'balanced', 'ultra'];

export function createGraphicsController(mode, touch) {
  // Keep mobile Auto below Ultra. Desktop starts without shadow maps.
  const ceiling = touch ? 2 : 3;
  const initial = touch ? 1 : 2;
  let level = initial;
  let good = 0;
  let bad = 0;
  let upgradeCooldown = 0;

  return {
    get level() { return mode === 'auto' ? AUTO_LEVELS[level] : mode; },
    setMode(next) {
      mode = next;
      level = initial;
      good = bad = upgradeCooldown = 0;
    },
    sample(fps) {
      if (mode !== 'auto') return false;
      if (upgradeCooldown > 0) upgradeCooldown--;
      bad = fps < 44 ? bad + 1 : 0;
      good = fps >= 57 ? good + 1 : 0;
      if (level > 0 && (fps < 28 || bad >= 2)) {
        level--;
        good = bad = 0;
        upgradeCooldown = 20;
        return true;
      }
      if (level < ceiling && good >= 6 && upgradeCooldown === 0) {
        level++;
        good = bad = 0;
        return true;
      }
      return false;
    },
  };
}

export function renderRatio(profile, width, height, deviceRatio, touch, split) {
  const pixels = Math.min(profile.pixels, touch ? 750_000 : split ? 2_500_000 : Infinity);
  return Math.min(profile.dpr, deviceRatio, Math.sqrt(pixels / Math.max(1, width * height)));
}

// Change the existing materials so paint, tint and brake light updates still reach every mesh.
export function createMaterialQuality() {
  const materials = new Map();
  const textures = new Set();
  const cheaper = { normalMap: null, bumpMap: null, roughnessMap: null, metalnessMap: null,
    aoMap: null, clearcoat: 0, anisotropy: 0, specularIntensity: 0 };
  return {
    clone(material) {
      const clone = material.clone();
      if (materials.has(material)) materials.set(clone, materials.get(material));
      return clone;
    },
    forget(list) {
      for (const material of list) materials.delete(material);
    },
    collect(root) {
      root.traverse(object => {
        if (!object.isMesh) return;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          const map = material.map;
          if (map) textures.add(map);
          if (!material.isMeshStandardMaterial || materials.has(material)) continue;
          const values = {};
          for (const name of Object.keys(cheaper)) {
            if (!(name in material) || material[name] === cheaper[name]) continue;
            values[name] = material[name];
            if (material[name]?.isTexture) textures.add(material[name]);
          }
          if (material.metalness > .25) values.metalness = material.metalness;
          materials.set(material, values);
        }
      });
    },
    apply(lite, anisotropy) {
      for (const [material, values] of materials) {
        let changed = false;
        for (const [name, original] of Object.entries(values)) {
          const value = lite ? cheaper[name] ?? (name === 'metalness' ? .25 : null) : original;
          if (material[name] === value) continue;
          material[name] = value;
          changed = true;
        }
        if (changed) material.needsUpdate = true;
      }
      for (const texture of textures) {
        if (texture.anisotropy === anisotropy) continue;
        texture.anisotropy = anisotropy;
        if (texture.image) texture.needsUpdate = true;
      }
    },
  };
}

export function createRenderDiagnostics(renderer, output) {
  const params = new URLSearchParams(location.search);
  const enabled = params.get('perf') === '1';
  const gl = enabled ? renderer.getContext() : null;
  const timer = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending = [];
  let query, gpuTime, sampledAt = 0, sampleStarted = performance.now();
  let stats = null;
  const frameTimes = [];
  output.hidden = !enabled;
  return {
    simpleMaterials:enabled && params.get('materials') === 'simple',
    disableSmoke:enabled && params.get('smoke') === '0',
    disableShadows:enabled && params.get('shadows') === '0',
    get stats() { return stats; },
    begin() {
      if (!timer) return;
      const previous = pending[0];
      if (previous && gl.getQueryParameter(previous,gl.QUERY_RESULT_AVAILABLE)) {
        pending.shift();
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
          gpuTime = gl.getQueryParameter(previous,gl.QUERY_RESULT)/1e6;
        } else gpuTime = undefined;
        gl.deleteQuery(previous);
      }
      const now = performance.now();
      if (now-sampledAt<180 || pending.length>=4) return;
      sampledAt = now;
      query = gl.createQuery();
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
    },
    end(elapsed) {
      if (!enabled) return;
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push(query);
        query = undefined;
      }
      if (elapsed>0 && elapsed<1) frameTimes.push(elapsed*1000);
      const now = performance.now();
      if (now-sampleStarted<1000 || !frameTimes.length) return;
      const sorted = frameTimes.sort((a,b) => a-b);
      const frameMs = sorted.reduce((sum,value) => sum+value,0)/sorted.length;
      const p95 = sorted[Math.floor((sorted.length-1)*.95)];
      const {calls,triangles} = renderer.info.render;
      stats = {fps:Math.round(1000/frameMs),frameMs,p95,gpuMs:gpuTime,calls,triangles};
      output.textContent = `${stats.fps} FPS · ${frameMs.toFixed(1)} мс / кадр · p95 ${p95.toFixed(1)} мс\n`
        + `GPU ${gpuTime===undefined ? '—' : gpuTime.toFixed(1)+' мс'} · ${calls} вызовов · ${triangles} треуг.`;
      frameTimes.length = 0;
      sampleStarted = now;
    },
  };
}
