export const GRAPHICS = {
  ultra: { pixels: 3_100_000, dpr: 1.5, far: 185, shadows: true, shadowMs: 1000/20, smoke: true },
  balanced: { pixels: 1920*1080, dpr: 1.5, far: 154, smoke: 'light', remoteDetail: 46 },
  integrated: { pixels: 1600*900, dpr: 1.25, far: 112, lite: true, remoteDetail: 38 },
  performance: { pixels: 1280*720, dpr: 1, far: 105, lite: true, remoteDetail: 34 },
  minimum: { pixels: 960*540, dpr: 1, far: 85, lite: true, remoteDetail: 30 },
};

export function useDistantCar(distanceSquared, detailRange, alreadyDistant) {
  // Hysteresis avoids flickering between models during an overtake.
  const threshold=detailRange+(alreadyDistant ? 0 : 8);
  return Number.isFinite(detailRange) && distanceSquared>threshold**2;
}

const AUTO_LEVELS = ['minimum', 'performance', 'integrated', 'balanced'];

export function createGraphicsController(mode, touch) {
  // Keep expensive shadow-map and environment compilation out of automatic upgrades.
  const ceiling = AUTO_LEVELS.length-1;
  const initial = touch ? 1 : ceiling;
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
  const detailed=new WeakSet();
  const detailedTextures=new WeakSet();
  const materials = new Map();
  const cheaper = { normalMap: null, bumpMap: null, roughnessMap: null, metalnessMap: null,
    aoMap: null, clearcoat: 0, anisotropy: 0, specularIntensity: 0 };
  const tracked = new Map();
  return {
    clone(material) {
      const clone = material.clone();
      if (materials.has(material)) materials.set(clone, materials.get(material));
      if (detailed.has(material)) detailed.add(clone);
      return clone;
    },
    forget(list) {
      for (const material of list) {
        materials.delete(material);
        tracked.delete(material);
      }
    },
    register(material) {
      if (tracked.has(material)) return;
      tracked.set(material,new Set(Object.values(material).filter(value=>value?.isTexture)));
      if (!material.isMeshStandardMaterial || materials.has(material)) return;
      const values={};
      for (const [name,fallback] of Object.entries(cheaper)) {
        if (name in material && material[name]!==fallback) values[name]=material[name];
      }
      if (material.metalness>.25) values.metalness=material.metalness;
      materials.set(material,values);
    },
    collect(root,preserveDetail=false) {
      root.traverse(object=>{
        if (!object.isMesh) return;
        const list=Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          this.register(material);
          if (!preserveDetail) continue;
          detailed.add(material);
          for (const texture of tracked.get(material)) detailedTextures.add(texture);
        }
      });
    },
    release(root,sharedGeometry) {
      const geometry=new Set(),textures=new Set(),owned=new Set();
      root.removeFromParent();
      root.traverse(object=>{
        if (!object.isMesh) return;
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry!==sharedGeometry) geometry.add(object.geometry);
        const list=Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          owned.add(material);
          for (const texture of tracked.get(material) ?? []) textures.add(texture);
        }
      });
      for (const [material,references] of tracked) {
        if (owned.has(material)) continue;
        for (const texture of references) textures.delete(texture);
      }
      for (const item of geometry) item.dispose();
      for (const item of textures) item.dispose();
      for (const item of owned) item.dispose();
      this.forget(owned);
    },
    apply(lite, anisotropy, maxAnisotropy=anisotropy) {
      for (const [material, values] of materials) {
        let changed = false;
        for (const [name, original] of Object.entries(values)) {
          const value = lite && !detailed.has(material) ? cheaper[name] ?? (name === 'metalness' ? .25 : null) : original;
          if (material[name] === value) continue;
          material[name] = value;
          changed = true;
        }
        if (changed) material.needsUpdate = true;
      }
      const textures=new Set([...tracked.values()].flatMap(items=>[...items]));
      for (const texture of textures) {
        const target=detailedTextures.has(texture) ? Math.min(Math.max(4,anisotropy),maxAnisotropy) : anisotropy;
        if (texture.anisotropy === target) continue;
        texture.anisotropy = target;
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
