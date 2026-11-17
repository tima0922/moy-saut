import { Group, Quaternion, Vector3, MathUtils } from 'three';
import { enterRoom } from './online.js?v=021';

const $ = selector => document.querySelector(selector);
const colors = ['#ffad69','#7ce5df','#bfd48c','#c6aaff'];
const states = {
  waiting:'Ждём других пилотов',
  connecting:'Подключаем пилотов…',
  direct:'Прямая связь',
  relay:'Резервное соединение',
  retrying:'Восстанавливаем связь…',
};

export function createOnlineView({scene, models, selection, start, leave, spawn}) {
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
  const remotes = new Map();
  const target = new Vector3();
  const codeFromLink = new URLSearchParams(location.search).get('room');
  let room, pending = false, rosterText, copyTimer;

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

  function updateRoster(members, state) {
    const connection = $('#online-link-status');
    if (connection.textContent !== states[state]) connection.textContent = states[state];
    if (!members) return;
    const signature = JSON.stringify(members.map(({id,nick}) => [id,nick]));
    if (signature === rosterText) return;
    rosterText = signature;
    $('#online-count').textContent = members.length + ' / 4';
    const ids = new Set(members.map(({id}) => id));
    for (const id of remotes.keys()) if (!ids.has(id)) clearRemote(id);
    list.replaceChildren(...members.map(member => {
      const item = document.createElement('li');
      item.style.setProperty('--driver',colors[member.slot]);
      item.textContent = member.nick + (member.id === room.id ? ' · ты' : '') + (member.slot === 0 ? ' · хост' : '');
      return item;
    }));
  }

  function updatePose(member, pose) {
    let remote = remotes.get(member.id);
    if (!remote) {
      const root = new Group();
      root.add(spawn(member.slot, colors[member.slot]));
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('r','2.3');
      dot.setAttribute('fill',colors[member.slot]);
      dot.setAttribute('stroke','#171719');
      dot.setAttribute('stroke-width','.5');
      $('#map-arena').append(dot);
      const orientation = new Quaternion().fromArray(pose,3).normalize();
      remote = {root,dot,orientation,pose};
      root.position.fromArray(pose);
      root.quaternion.copy(orientation);
      scene.add(root);
      remotes.set(member.id,remote);
    }
    remote.pose = pose;
    remote.orientation.fromArray(pose,3).normalize();
    remote.last = performance.now();
  }

  async function connect(code) {
    if (pending || room) return;
    pending = create.disabled = join.disabled = true;
    status.textContent = 'Подключаемся…';
    try {
      room = await enterRoom({
        code, nick:nick.value,
        onRoster:updateRoster, onPose:updatePose,
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
      start(select.value);
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
    get active() { return Boolean(room); },
    get slot() { return room?.slot ?? 0; },
    tick(now,dt,car,velocity) {
      if (!room) return;
      room.tick(now,[...car.position.toArray(),...car.quaternion.toArray(),velocity.x,velocity.z]);
      const blend = 1 - Math.exp(-14 * dt);
      for (const remote of remotes.values()) {
        const age = (now - remote.last) / 1000;
        remote.root.visible = age < 2;
        remote.dot.style.display = age < 2 ? '' : 'none';
        if (age >= 2) continue;
        const [x,y,z,,,,,vx,vz] = remote.pose;
        const ahead = MathUtils.clamp(age,0,.25);
        target.set(x + vx * ahead,y,z + vz * ahead);
        if (remote.root.position.distanceToSquared(target) > 17 ** 2) remote.root.position.copy(target);
        else remote.root.position.lerp(target,blend);
        remote.root.quaternion.slerp(remote.orientation,blend);
        remote.dot.setAttribute('cx',remote.root.position.x.toFixed(2));
        remote.dot.setAttribute('cy',(-remote.root.position.z).toFixed(2));
      }
    },
    openInvite() { if (/^\d{6}$/.test(codeFromLink ?? '')) show(); },
  };
}
