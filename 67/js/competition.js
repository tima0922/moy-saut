export const MATCH_MODES = {
  free:{label:'Свободный заезд',description:'Катайтесь в своём темпе.'},
  elimination:{label:'Кольцо на вылет',description:'Держи занос на «Стадионе». Побеждает последний на трассе.'},
  battle:{label:'Дрифт-баттл',description:'90 секунд на очки. Угол, скорость и клип-зоны приносят баллы.'},
  parkour:{label:'Паркур в порту',description:'30 чекпоинтов, 4,60 км. Развилки, диагональные прыжки, баржа и крыши контейнеров. Каждый возврат добавляет 3 секунды.'},
};
export const RESET_PENALTY = 3000;

export function formatTime(milliseconds,precision = 0) {
  const time = Math.max(0,milliseconds);
  const seconds = Math.floor(time/1000);
  const base = Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  return precision ? base+'.'+String(Math.floor(time%1000/10)).padStart(2,'0') : base;
}

export function rankRound(round) {
  const results = new Map(round.results.map(result=>[result.id,result]));
  const rows = round.roster.map(member=>({...member,...results.get(member.id),last:member.id===round.winner}));
  const priority = row=>row.last ? 0 : row.status==='finished' ? 1 : row.status==='dnf' || round.finished ? 3 : 2;
  const score = row=>row.value+row.resets*RESET_PENALTY;
  return rows.sort((a,b)=>priority(a)-priority(b) ||
    (a.status==='finished' && b.status==='finished' ? round.mode==='parkour' ? score(a)-score(b) : b.value-a.value : 0));
}

export function eliminationRun(startsAt) {
  let began, lastSlide, ended;
  return {
    get begun() { return began!==undefined; },
    get elapsed() { return ended ?? (lastSlide===undefined ? 0 : lastSlide-began); },
    tick(now,run) {
      if (ended!==undefined || now<startsAt) return;
      if (run.sliding) {
        began ??= now;
        lastSlide = now;
        return;
      }
      if (began===undefined) {
        if (now>=startsAt+10000) return ended=0;
      } else if (run.warning || now-lastSlide>=500) {
        return ended=Math.max(0,lastSlide-began);
      }
    },
  };
}
