const SAMPLE_MS = 70;
const MAX_LAP_MS = 5 * 60 * 1000;
const MAX_FRAMES = Math.ceil(MAX_LAP_MS/SAMPLE_MS)+2;
const keyFor = track => 'garage-life-neon-ghost-1-'+track;
const models = new Set(['sedan','f90','cls','supra']);

export function readRaceGhost(storage, track) {
  try {
    const value=storage?.getItem(keyFor(track));
    if (!value || value.length>480_000) return null;
    const clip=JSON.parse(value);
    if (!models.has(clip?.model) || !(clip.duration>0 && clip.duration<=MAX_LAP_MS) ||
        !Array.isArray(clip.sectors) || clip.sectors.length!==4 ||
        !clip.sectors.every((time,i)=>Number.isFinite(time) && time>(clip.sectors[i-1] ?? 0)) ||
        clip.sectors[3]!==clip.duration || !Array.isArray(clip.frames) ||
        clip.frames.length<2 || clip.frames.length>MAX_FRAMES ||
        clip.frames[0]?.[0]!==0 || clip.frames.at(-1)?.[0]!==clip.duration ||
        !clip.frames.every((row,i)=>Array.isArray(row) && row.length===8 && row.every(Number.isFinite) &&
          (!i || row[0]>clip.frames[i-1][0]))) return null;
    return clip;
  } catch {
    return null;
  }
}

export function saveRaceGhost(storage,track,clip) {
  try { storage?.setItem(keyFor(track),JSON.stringify(clip)); } catch { /* Keep the new best in memory. */ }
}

function blend(a,b,t,out = [],offset=0) {
  for (let i=0;i<3;i++) out[i]=a[i+offset]+(b[i+offset]-a[i+offset])*t;
  let dot=0;
  for (let i=3;i<7;i++) dot+=a[i+offset]*b[i+offset];
  const sign=dot<0 ? -1 : 1;
  for (let i=3;i<7;i++) out[i]=a[i+offset]+(b[i+offset]*sign-a[i+offset])*t;
  const norm=Math.hypot(out[3],out[4],out[5],out[6]) || 1;
  for (let i=3;i<7;i++) out[i]/=norm;
  return out;
}

export function sampleRaceGhost(clip,time,out=[]) {
  if (time<0 || time>clip.duration) return null;
  let lo=0, hi=clip.frames.length-1;
  while (hi-lo>1) {
    const mid=(lo+hi)>>1;
    if (clip.frames[mid][0]<=time) lo=mid;
    else hi=mid;
  }
  const a=clip.frames[lo], b=clip.frames[hi];
  return blend(a,b,(time-a[0])/(b[0]-a[0]),out,1);
}

export function createGhostSession(model,best,onBest) {
  let lap, previous;
  const state = { best, target:null, started:null, split:null, invalid:false };
  function append(time,pose) {
    lap.frames.push([time,...pose.map((value,i)=>{
      const precision=i<3 ? 100 : 10000;
      return Math.round(value*precision)/precision;
    })]);
  }
  function start(at,pose) {
    state.target=state.best;
    state.started=at;
    state.invalid=false;
    lap={frames:[],sectors:[]};
    append(0,pose);
  }

  function reset() {
    lap=previous=undefined;
    state.started=null;
    state.target=null;
    state.split=null;
    state.invalid=true;
  }

  return {
    state, reset,
    tick(now,pose,crossing) {
      if (crossing) {
        const linePose=previous ? blend(previous,pose,crossing.fraction) : pose;
        const { at, sector, line }=crossing;
        if (lap && sector) {
          const elapsed=Math.round(at-state.started);
          const delta=state.target ? elapsed-state.target.sectors[sector-1] : null;
          state.split={sector,delta,at};
          lap.sectors.push(elapsed);
          if (line && elapsed>0 && elapsed<=MAX_LAP_MS && lap.sectors.length===4 && (!state.best || elapsed<state.best.duration)) {
            if (lap.frames.at(-1)[0]>=elapsed) lap.frames.pop();
            append(elapsed,linePose);
            state.best={model,duration:elapsed,sectors:lap.sectors,frames:lap.frames};
            state.split.record=true;
            onBest(state.best);
          }
        }
        if (line) start(at,linePose);
      }
      if (lap) {
        const elapsed=Math.round(now-state.started);
        if (elapsed>MAX_LAP_MS) reset();
        else if (elapsed-lap.frames.at(-1)[0]>=SAMPLE_MS) append(elapsed,pose);
      }
      previous=pose;
    },
  };
}
