import { MathUtils } from 'three';

const profiles = {
  sedan: { harmonics:[0,1,.31,.17,.34,.13,.08,.05], ratio:1.00, cutoff:540 },
  f90: { harmonics:[0,.81,.41,.19,.49,.21,.18,.07], ratio:1.09, cutoff:720 },
  cls: { harmonics:[0,1,.57,.35,.19,.13,.05,.02], ratio:.91, cutoff:450 },
  supra: { harmonics:[0,.96,.23,.46,.14,.22,.11,.04], ratio:.84, cutoff:875 },
};

export function createDriftAudio(context) {
  const master = context.createGain();
  master.gain.value = .8;
  master.connect(context.destination);
  const buffer = context.createBuffer(1,context.sampleRate,context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i=0; i<samples.length; i++) samples[i] = Math.random()*2-1;
  const waves = new Map(Object.entries(profiles).map(([id,profile]) => [id,context.createPeriodicWave(
    new Float32Array(profile.harmonics.length),Float32Array.from(profile.harmonics),
  )]));
  const approach = (param,target,seconds=.055) => param.setTargetAtTime(target,context.currentTime,seconds);

  function voice() {
    const pan = context.createStereoPanner();
    pan.connect(master);
    const engine = context.createOscillator();
    const low = context.createBiquadFilter();
    const engineLevel = context.createGain();
    low.type = 'lowpass';
    engineLevel.gain.value = 0;
    engine.connect(low).connect(engineLevel).connect(pan);
    engine.start();
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const tireFilter = context.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.Q.value = 1.15;
    const tire = context.createGain();
    tire.gain.value = 0;
    noise.connect(tireFilter).connect(tire).connect(pan);
    noise.start();

    const curb = context.createOscillator();
    curb.type = 'triangle';
    const curbFilter = context.createBiquadFilter();
    curbFilter.type = 'lowpass';
    curbFilter.frequency.value = 235;
    const curbLevel = context.createGain();
    curbLevel.gain.value = 0;
    curb.connect(curbFilter).connect(curbLevel).connect(pan);
    curb.start();
    let selected;
    return ({id='sedan',rpm=0,speed=0,slip=0,grounded=false,curbing=false,load=false,gain=0,side=0,tool=0}) => {
      id = profiles[id] ? id : 'sedan';
      const profile = profiles[id];
      if (id!==selected) {
        engine.setPeriodicWave(waves.get(id));
        selected = id;
      }
      approach(pan.pan,side);
      const pitch = Math.max(24,rpm/30*profile.ratio);
      approach(engine.frequency,tool || pitch);
      approach(low.frequency,profile.cutoff+pitch*(load ? 4.1 : 2.1));
      approach(engineLevel.gain,gain*(load ? 1.16 : .88));
      const slide = grounded && speed>3 ? MathUtils.smoothstep(Math.abs(slip),.07,.64) : 0;
      approach(tireFilter.frequency,780+Math.min(640,speed*25)+slide*240);
      approach(tire.gain,slide*Math.min(.11,gain*1.42),.032);
      approach(curb.frequency,Math.max(18,speed*5.5),.032);
      approach(curbLevel.gain,curbing ? gain*.74 : 0,.025);
    };
  }
  return { context, player:voice(), guest:voice() };
}
