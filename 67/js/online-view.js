import { Group, Quaternion, Vector3, MathUtils } from 'three';
import { enterRoom } from './online.js?v=022';

const $ = selector => document.querySelector(selector);
const colors = ['#ffad69','#7ce5df','#bfd48c','#c6aaff'];
const states = {
  waiting:'Ждём других пилотов',
  connecting:'Подключаем пилотов…',
  direct:'Прямая связь',
  relay:'Резервное соединение',
  retrying:'Восстанавливаем связь…',
};

export function createOnlineView({scene, models, selection, start, leave, spawn,paint,impact}) {
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
  const q1 = new Quaternion(), q2 = new Quaternion();
  const remotes = new Map();
  const target = new Vector3(), qPosition = new Vector3();
  const codeFromLink = new URLSearchParams(location.search).get('room');
  let room, pending = false, rosterText, copyTimer, lite = false, nextMap = 0;

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
    list.replaceChildren();
    for (const id of remotes.keys()) clearRemote(id);
    hud.hidden = true;
  }

  function updateRoster(members,state,network = {}) {
    const connection = $('#online-link-status');
    if (connection.textContent !== states[state]) connection.textContent = states[state];
    if (!members) return;
    const latencyLabel = id => {
      const link = network[id];
      if (!link) return '';
      const delay = Number.isFinite(link.rtt) ? Math.round(link.rtt)+' мс' : '…';
      return link.type === 'WebRTC' ? 'WebRTC · '+delay : 'HTTPS · '+delay+' до сервера';
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
      car.setLite(lite);
      root.add(car.root);
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('r','2.3');
      dot.setAttribute('fill',colors[member.slot]);
      dot.setAttribute('stroke','#171719');
      dot.setAttribute('stroke-width','.5');
      $('#map-arena').append(dot);
      const orientation = new Quaternion().fromArray(pose,3).normalize();
      remote = {root,car,dot,orientation,frames:[],cadence:50};
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
      remote.cadence = transport==='rtc' ? 50 : 220;
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
        code,nick:nick.value,model:select.value,color:paint(select.value),route:route.value,contacts:contacts.value==='on',
        onRoster:updateRoster,onPose:updatePose,onImpact:impact,
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
      start(select.value,room.route);
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
    setLite(value) {
      if (lite===value) return;
      lite = value;
      for (const remote of remotes.values()) remote.car.setLite(lite);
    },
    get active() { return Boolean(room); },
    get slot() { return room?.slot ?? 0; },
    tick(now,dt,car,velocity) {
      if (!room) return;
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
        remote.car.rotateWheels(Math.hypot(last.pose[7],last.pose[8])*dt);
        if (!drawMap) continue;
        remote.dot.setAttribute('cx',remote.root.position.x.toFixed(2));
        remote.dot.setAttribute('cy',(-remote.root.position.z).toFixed(2));
      }
    },
    openInvite() { if (/^\d{6}$/.test(codeFromLink ?? '')) show(); },
  };
}
