import { createClubLayout, createShortLayout } from './drift.js?v=037';
import { createStadiumLayout, createStadiumLinkLayout } from './stadium-layout.js?v=037';
import { createCityLayout } from './city-layout.js?v=032';

let layouts;
export function trackLayouts() {
  if (layouts) return layouts;
  const main = createClubLayout(), stadium = createStadiumLayout();
  return layouts = {
    main, short:createShortLayout(main), stadium, 'stadium-s':createStadiumLinkLayout(stadium), city2:createCityLayout(),
  };
}

export function trackMapPath(track) {
  return 'M '+track.road.map(p=>p.x.toFixed(2)+' '+(-p.z).toFixed(2)).join(' L ')+(track.port ? '' : ' Z');
}

export const NEON_TRACKS = { main:'main', stadium:'ring', city2:'city2' };
