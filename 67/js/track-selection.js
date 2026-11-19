import { trackLayouts, trackMapPath, NEON_TRACKS } from './track-layouts.js?v=037';
import { createRaceCourse, readRaceBest } from './neon-race.js?v=037';
import { readRaceGhost } from './race-ghost.js?v=037';
import { formatTime } from './competition.js?v=030';

const courses = new Map();
export function describeNeonRoute(value, storage) {
  const track=trackLayouts()[value], {road}=track;
  const id=NEON_TRACKS[value];
  if (!courses.has(id)) courses.set(id,createRaceCourse(track));
  const xs=road.map(p=>p.x), zs=road.map(p=>p.z);
  const x=Math.min(...xs), z=Math.max(...zs);
  const w=Math.max(...xs)-x, h=z-Math.min(...zs), pad=Math.max(w,h)*.12;
  const best=readRaceBest(storage,id);
  const ghost=readRaceGhost(storage,id);
  return {
    viewBox:[x-pad,-z-pad,w+2*pad,h+2*pad].join(' '), path:trackMapPath(track), x:road[0].x, y:-road[0].z, r:w*.027,
    distance:Math.round(courses.get(id).length)+' м / круг',
    details:track.city ? 'Бульвар · Речной мост · Рынок · Тоннель' : track.stadium ? 'Круг постоянного радиуса' : 'Связки и перепады высоты',
    record:best===null ? '' : 'Лучший заезд · '+formatTime(best,2), lap:ghost ? 'Лучший чистый круг · '+formatTime(ghost.duration,2) : '',
  };
}

export function practiceZones(value) {
  const track=trackLayouts()[value];
  if (!track) return [['0','Порт']];
  const gates=track.gates.map((gate,index)=>[String(index),gate.label ?? `Перед створом ${index+1}`]);
  return track.stadium ? gates : [['pad','Площадка для восьмёрок'],...gates];
}
