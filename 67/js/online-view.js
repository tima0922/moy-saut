import { useDistantCar } from './graphics.js?v=033';
import { Group, Quaternion, Vector3, MathUtils } from 'three';
import { draftStrength } from './neon-race.js?v=032';
import { enterRoom } from './online.js?v=034';

import { MATCH_MODES,RESET_PENALTY,formatTime,rankRound } from './competition.js?v=030';

const scoreFormat = new Intl.NumberFormat('ru-RU');
const $ = selector => document.querySelector(selector);
const colors = ['#ffad69','#7ce5df','#bfd48c','#c6aaff'];
const states = {
  waiting:'Ждём других пилотов',
  connecting:'Подключаем пилотов…',
  direct:'Прямая связь',
  socket:'Связь через WebSocket',
  relay:'Резервное соединение',
  retrying:'Восстанавливаем связь…',
};

export function createOnlineView({scene, models, selection,start,leave,spawn,paint,impact,roundStart,roundInfo}) {
  const dialog = $('#online-dialog');
  const status = $('#online-status');
  const hud = $('#online-hud');
  const select = $('#online-model');
  const input = $('#online-input');
  const create = $('#online-create');
  const join = $('#online-join');
  const copy = $('#online-copy');
  const nick = $('#online-nick');
  const list = $('#online-roster');
  const route = $('#online-route');
  const contacts = $('#online-contacts');
  const modes = $('#online-modes');
  const launch = $('#match-start');
  const matchPanel = $('#match-panel');
  const matchStatus = $('#match-status');
  const matchTime = $('#match-time');
  const resultList = $('#match-results');
  const matchError = $('#match-error');
  const q1 = new Quaternion(), q2 = new Quaternion();
  const remotes = new Map();
  const target = new Vector3(), qPosition = new Vector3();
  const codeFromLink = new URLSearchParams(location.search).get('room');
  let room,pending = false,rosterText,copyTimer,detailRange = Infinity,nextMap = 0;
  let round,matchAt = 0,membersCount = 1,starting = false,outcome,reporting = false,reportAt = 0,lastResults;
  const chosenMode = () => modes.querySelector('input:checked').value;

  function changeMode() {
    const mode = chosenMode();
    const chooseRoute = mode==='free' || mode==='battle' || mode==='race';
    $('#online-route-row').hidden = !chooseRoute;
    $('#online-contact-row').hidden = mode!=='free';
    route.querySelector('[value=city2]').disabled=mode!=='race';
    if(mode!=='race' && route.value==='city2') route.value='main';
    const stadium = route.querySelector('[value="stadium"]');
    stadium.disabled = mode==='battle';
    route.querySelector('[value=short]').disabled = mode==='race';
    if (mode==='race' && route.value==='short') route.value='main';
    if (mode==='battle' && route.value==='stadium') route.value = 'main';
    $('#online-mode-description').textContent = MATCH_MODES[mode].description;
  }
  modes.addEventListener('change',changeMode);
  changeMode();

  function launchState() {
    launch.hidden = !room || room.mode==='free' || room.slot!==0;
    launch.disabled = starting || membersCount<2 || Boolean(round && !round.finished);
    launch.textContent = round?.finished ? 'Реванш' : 'Начать раунд';
  }

  function matchChanged(next,now) {
    if (!room || now<matchAt || round?.id===next?.id && round?.finished && !next?.finished) return;
    matchAt = now;
    if (next?.id!==round?.id) {
      outcome = undefined;
      reportAt = 0;
      if (next?.roster.some(player=>player.id===room.id)) roundStart(next);
    }
    round = next;
    launchState();
  }

  function reportOutcome(result,now) {
    if (!round || round.finished || !result) return;
    outcome ??= result;
    if (reporting || now<reportAt || round.results.some(row=>row.id===room.id)) return;
    const current = room, id = round.id;
    reporting = true;
    reportAt = now+1400;
    current.report(id,outcome).catch(()=>{}).finally(()=>{
      if (room===current) reporting = false;
    });
  }

  function renderMatch(now) {
    if (!room || room.mode==='free') return;
    const current = room.serverNow;
    const playing = round?.roster.some(player=>player.id===room.id);
    let message = membersCount<2 ? 'Ждём ещё одного игрока.' : 'Хост может запустить раунд.';
    let time = '';
    if (round?.finished) {
      message = 'Раунд завершён.';
      const rows = rankRound(round);
      const signature = JSON.stringify(rows);
      if (signature!==lastResults) {
        lastResults = signature;
        resultList.replaceChildren(...rows.map((row,index)=>{
          const item = document.createElement('li');
          const label = document.createElement('span');
          const value = document.createElement('strong');
          label.textContent = `${index+1}. ${row.nick}` + (row.id===room.id ? ' · ты' : '');
          value.textContent = row.last ? 'Победитель' : row.status!=='finished' ? 'Не финишировал' :
            round.mode==='battle' ? scoreFormat.format(row.value)+' очк.' :
            round.mode==='elimination' ? formatTime(row.value,2) :
            formatTime(row.value+row.resets*RESET_PENALTY,2)+(row.resets ? ` (+${3*row.resets} с)` : '');
          item.append(label,value);
          return item;
        }));
      }
    } else if (round) {
      if (!playing) message = 'Раунд уже идёт. Ты сможешь стартовать в следующем.';
      else if (current<round.startsAt) {
        time = String(Math.ceil((round.startsAt-current)/1000));
        message = 'Приготовься к старту';
      } else {
        const info = roundInfo();
        reportOutcome(info?.outcome,now);
        time = formatTime(Math.ceil(Math.max(0,round.endsAt-current)/1000)*1000);
        message = info?.text ?? 'Заезд начался';
        if (outcome && !round.results.some(row=>row.id===room.id)) message += ' · отправляем результат';
        if (round.mode==='elimination') message += ` · в игре ${round.roster.length-round.results.length}/${round.roster.length}`;
      }
    }
    if (matchStatus.textContent!==message) matchStatus.textContent = message;
    if (matchTime.textContent!==time) matchTime.textContent = time;
    matchTime.hidden = !time;
    resultList.hidden = !round?.finished;
  }

  launch.onclick = async () => {
    if (!room || launch.disabled) return;
    const current = room;
    starting = true;
    launchState();
    matchError.hidden = true;
    try {
      await room.startRound();
    } catch (error) {
      if (room!==current) return;
      matchError.textContent = error.code ? error.message : 'Не удалось начать раунд. Попробуй ещё раз.';
      matchError.hidden = false;
    } finally {
      if (room===current) {
        starting = false;
        launchState();
      }
    }
  };

  for (const [id,model] of Object.entries(models)) select.add(new Option(model.code,id));

  function show(message = '') {
    if (dialog.open) return;
    status.textContent = message;
    select.value = selection();
    if (!input.value && /^\d{6}$/.test(codeFromLink ?? '')) input.value = codeFromLink;
    dialog.showModal();
  }

  function clearRemote(id) {
    const remote = remotes.get(id);
    scene.remove(remote.root);
    remote.car.dispose();
    remote.dot.remove();
    remotes.delete(id);
  }

  function clear() {
    room?.close();
    room = undefined;
    clearTimeout(copyTimer);
    copy.textContent = 'Копировать';
    rosterText = undefined;
    round = outcome = lastResults = undefined;
    matchAt = reportAt = 0;
    membersCount = 1;
    starting = reporting = false;
    resultList.replaceChildren();
    matchPanel.hidden = matchError.hidden = true;
    launchState();
    list.replaceChildren();
    for (const id of remotes.keys()) clearRemote(id);
    hud.hidden = true;
  }

  function updateRoster(members,state,network = {}) {
    const connection = $('#online-link-status');
    if (connection.textContent !== states[state]) connection.textContent = states[state];
    if (!members) return;
    membersCount = members.length;
    launchState();
    const latencyLabel = id => {
      const link = network[id];
      if (!link) return '';
      const delay = Number.isFinite(link.rtt) ? Math.round(link.rtt)+' мс' : '…';
      return link.type+' · '+delay+(link.type==='WebRTC' ? '' : ' до сервера');
    };
    const signature = JSON.stringify(members.map(({id,nick}) => [id,nick,latencyLabel(id)]));
    if (signature === rosterText) return;
    rosterText = signature;
    $('#online-count').textContent = members.length + ' / 4';
    const ids = new Set(members.map(({id}) => id));
    for (const id of remotes.keys()) if (!ids.has(id)) clearRemote(id);
    list.replaceChildren(...members.map(member => {
      const item = document.createElement('li');
      item.style.setProperty('--driver',colors[member.slot]);
      item.textContent = member.nick + (member.id === room.id ? ' · ты' : '') + (member.slot === 0 ? ' · хост' : '');
      const latency = latencyLabel(member.id);
      if (latency) {
        const info = document.createElement('small');
        info.textContent = latency;
        item.append(info);
      }
      return item;
    }));
  }

  function updatePose(member,pose,transport='rtc') {
    let remote = remotes.get(member.id);
    if (!remote) {
      const root = new Group();
      const model = Object.hasOwn(models,member.model) ? member.model : 'sedan';
      const car = spawn(model,/^#[0-9a-f]{6}$/i.test(member.color) ? member.color : colors[member.slot]);
      root.add(car.root);
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('r','2.3');
      dot.setAttribute('fill',colors[member.slot]);
      dot.setAttribute('stroke','#171719');
      dot.setAttribute('stroke-width','.5');
      $('#map-arena').append(dot);
      const orientation = new Quaternion().fromArray(pose,3).normalize();
      remote = {root,car,dot,orientation,frames:[],cadence:50,distant:false};
      root.position.fromArray(pose);
      root.quaternion.copy(orientation);
      scene.add(root);
      remotes.set(member.id,remote);
    }
    const time = performance.now();
    const old = remote.frames.at(-1);
    if (old && transport===remote.transport) {
      remote.cadence = remote.cadence*.8+MathUtils.clamp(time-old.time,16,500)*.2;
    } else {
      remote.cadence = transport==='rtc' ? 50 : transport==='socket' ? 150 : 220;
      remote.frames.length = 0;
    }
    remote.transport = transport;
    // A large jump after a confirmed stationary reset is a respawn.
    if (old && Math.hypot(pose[0]-old.pose[0],pose[2]-old.pose[2]) > 24 && Math.hypot(pose[7],pose[8]) < .6) {
      remote.frames.length = 0;
      remote.root.position.fromArray(pose);
    }
    remote.frames.push({time,pose});
    if (remote.frames.length>18) remote.frames.shift();
  }

  async function connect(code) {
    if (pending || room) return;
    pending = create.disabled = join.disabled = true;
    status.textContent = 'Подключаемся…';
    try {
      room = await enterRoom({
        code,nick:nick.value,model:select.value,color:paint(select.value),route:route.value,contacts:contacts.value==='on',mode:chosenMode(),
        onRoster:updateRoster,onPose:updatePose,onImpact:impact,onMatch:matchChanged,
        onClose(message) {
          clear();
          leave();
          show(message);
        },
      });
      const {slot, id} = room;
      dialog.close();
      $('#online-code').textContent = room.code;
      hud.hidden = false;
      updateRoster([{slot,id,nick:nick.value.trim() || 'Пилот ' + (slot + 1)}], 'waiting');
      start(select.value,room.route,room.mode);
      if (room.mode!=='free') {
        $('#match-title').textContent = MATCH_MODES[room.mode].label;
        matchPanel.hidden = false;
        renderMatch(performance.now());
      }
    } catch (error) {
      clear();
      show();
      status.textContent = error.code ? error.message : 'Не удалось подключиться. Попробуй ещё раз.';
    } finally {
      pending = create.disabled = join.disabled = false;
    }
  }

  $('#online-open').onclick = () => show();
  $('#online-cancel').onclick = () => { if (!pending) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g,''); });
  $('#online-form').onsubmit = event => { event.preventDefault(); void connect(input.value); };
  create.onclick = () => void connect();
  $('#online-leave').onclick = leave;
  copy.onclick = async () => {
    const code = room?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (room?.code !== code) return;
      copy.textContent = 'Готово';
    } catch {
      if (room?.code !== code) return;
      copy.textContent = 'Введи ' + code;
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copy.textContent = 'Копировать'; },1800);
  };

  return {
    clear, show,
    openRace(track,id) {
      modes.querySelector('[value=race]').checked=true;
      changeMode();
      route.value=track;
      show();
      select.value=id;
    },
    setDetailRange(value) { detailRange=value; },
    draftAt(position,velocity,now) {
      let strength=0;
      for(const remote of remotes.values()) {
        const sample=remote.frames.at(-1);
        if(sample && now-sample.time<450) strength=Math.max(strength,draftStrength(position,velocity,sample.pose));
      }
      return strength;
    },
    get active() { return Boolean(room); },
    get slot() { return room?.slot ?? 0; },
    get competitive() { return Boolean(room && room.mode!=='free'); },
    get roundLive() {
      return Boolean(room && round && !round.finished && round.roster.some(player=>player.id===room.id) &&
        room.serverNow>=round.startsAt && room.serverNow<round.endsAt);
    },
    get now() { return room?.serverNow ?? performance.now(); },
    tick(now,dt,car,velocity) {
      if (!room) return;
      renderMatch(now);
      room.tick(now,[...car.position.toArray(),...car.quaternion.toArray(),velocity.x,velocity.z]);
      const blend = 1 - Math.exp(-14 * dt);
      const drawMap = now>=nextMap;
      if (drawMap) nextMap = now+100;
      for (const remote of remotes.values()) {
        const frames = remote.frames;
        const last = frames.at(-1);
        const age = (now-last.time)/1000;
        remote.root.visible = age < 2;
        remote.dot.style.display = age < 2 ? '' : 'none';
        if (age >= 2) continue;
        const renderAt = now-MathUtils.clamp(remote.cadence*1.65,80,480);
        while (frames.length>2 && frames[1].time<=renderAt) frames.shift();
        const a = frames[0], b = frames[1] ?? a;
        if (renderAt<=b.time && a!==b) {
          const alpha = MathUtils.clamp((renderAt-a.time)/(b.time-a.time),0,1);
          target.fromArray(a.pose).lerp(qPosition.fromArray(b.pose),alpha);
          q1.fromArray(a.pose,3).normalize();
          q2.fromArray(b.pose,3).normalize();
          remote.orientation.slerpQuaternions(q1,q2,alpha);
        } else {
          const ahead = MathUtils.clamp((renderAt-last.time)/1000,0,.16);
          const [x,y,z,,,,,vx,vz] = last.pose;
          target.set(x+vx*ahead,y,z+vz*ahead);
          remote.orientation.fromArray(last.pose,3).normalize();
        }
        remote.root.position.lerp(target,blend);
        remote.root.quaternion.slerp(remote.orientation,blend);
        const distant=useDistantCar(remote.root.position.distanceToSquared(car.position),detailRange,remote.distant);
        if (distant!==remote.distant) {
          remote.distant=distant;
          remote.car.setDistant(distant);
        }
        remote.car.rotateWheels(Math.hypot(last.pose[7],last.pose[8])*dt);
        if (!drawMap) continue;
        remote.dot.setAttribute('cx',remote.root.position.x.toFixed(2));
        remote.dot.setAttribute('cy',(-remote.root.position.z).toFixed(2));
      }
    },
    openInvite() { if (/^\d{6}$/.test(codeFromLink ?? '')) show(); },
  };
}
