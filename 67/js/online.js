const endpoint = 'https://contour-67-rooms.bagirovtimur09.chatgpt.site/api/rooms';
const errors = {
  closed: 'Комната закрылась или хост вышел.',
  full: 'В комнате уже четыре пилота.',
  code: 'Введи шесть цифр.',
  server: 'Сервер комнат временно недоступен.',
};

async function request(body, options) {
  const reply = await fetch(endpoint, {
    method:'POST', body:JSON.stringify(body), credentials:'omit',
    signal:AbortSignal.timeout(6000), ...options,
  });
  const result = await reply.json();
  if (!reply.ok) throw Object.assign(new Error(errors[result.error] ?? errors.server), {code:result.error});
  return result;
}

function waitForIce(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(finish, 2200);
    function finish() {
      clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', changed);
      resolve();
    }
    function changed() {
      if (peer.iceGatheringState === 'complete') finish();
    }
    peer.addEventListener('icegatheringstatechange', changed);
  });
}

function acceptPose(pose) {
  return Array.isArray(pose) && pose.length === 9 && pose.every(Number.isFinite) &&
    Math.abs(pose[0]) < 150 && Math.abs(pose[1]) < 50 && pose[2] >= 60 && pose[2] <= 300 &&
    pose.slice(3,7).every(value => Math.abs(value) <= 1.01) &&
    Math.abs(pose[7]) < 150 && Math.abs(pose[8]) < 150;
}

export async function enterRoom({code, nick, onRoster, onPose, onClose}) {
  const room = await request({action:code ? 'join' : 'create', code, nick});
  const {id,secret} = room;
  const send = (action, body, options) => request({action,id,secret,...body}, options);
  const peers = new Map();
  let timer, latest, active = true, lastSent = 0, lastSync = performance.now();

  function detach(link) {
    link.channel?.close();
    link.peer?.close();
  }

  function close(notify = true) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    window.removeEventListener('pagehide', goodbye);
    for (const link of peers.values()) detach(link);
    peers.clear();
    if (notify) send('leave', {}, {keepalive:true}).catch(() => {});
  }

  const goodbye = () => close();
  window.addEventListener('pagehide', goodbye);

  function bindChannel(link, channel) {
    link.channel = channel;
    channel.onmessage = event => {
      if (!active || peers.get(link.id) !== link || typeof event.data !== 'string' || event.data.length > 380) return;
      try {
        const pose = JSON.parse(event.data);
        if (!acceptPose(pose)) return;
        link.lastDirect = performance.now();
        onPose(link, pose);
      } catch { /* An invalid frame can be ignored. */ }
    };
  }

  async function publish(link) {
    await waitForIce(link.peer);
    if (active && peers.get(link.id) === link && link.peer.localDescription) {
      await send('signal', {target:link.id, sdp:link.peer.localDescription.toJSON()});
    }
  }

  function add(member) {
    const link = {...member, started:performance.now(), lastDirect:0};
    peers.set(member.id, link);
    if (!window.RTCPeerConnection) return link;
    try {
      const peer = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      link.peer = peer;
      peer.ondatachannel = event => bindChannel(link, event.channel);
      if (room.slot < member.slot) {
        bindChannel(link, peer.createDataChannel('pose', {ordered:false,maxRetransmits:0}));
        peer.setLocalDescription().then(() => publish(link)).catch(() => detach(link));
      }
    } catch { detach(link); }
    return link;
  }

  async function acceptSignal(link, sdp) {
    if (!link?.peer || link.handled) return;
    link.handled = true;
    try {
      await link.peer.setRemoteDescription(sdp);
      if (sdp.type === 'offer') {
        await link.peer.setLocalDescription();
        await publish(link);
      }
    } catch { detach(link); }
  }

  function direct(link, now) {
    return link.channel?.readyState === 'open' && now - link.lastDirect < 2000 && link.lastDirect > 0;
  }

  async function sync() {
    if (!active) return;
    const now = performance.now();
    const relay = [...peers.values()].some(link => !direct(link, now));
    try {
      const response = await send('sync', {relay, pose:relay ? latest : undefined,
        signals:[...peers.values()].some(link => !link.handled)});
      if (!active) return;
      lastSync = performance.now();
      const connected = new Set(response.peers.map(member => member.id));
      for (const [key,link] of peers) {
        if (connected.has(key)) continue;
        detach(link);
        peers.delete(key);
      }
      for (const member of response.peers) {
        if (member.id === id) continue;
        const link = peers.get(member.id) ?? add(member);
        if (member.pose && !direct(link, lastSync)) onPose(link, member.pose);
      }
      for (const signal of response.signals) void acceptSignal(peers.get(signal.from), signal.sdp);
      const links = [...peers.values()];
      onRoster(response.peers, links.every(link => direct(link,lastSync)) ? (links.length ? 'direct' : 'waiting') :
        links.some(link => !direct(link,lastSync) && lastSync - link.started > 6500) ? 'relay' : 'connecting');
    } catch (error) {
      if (!active) return;
      if (error.code === 'closed' || performance.now() - lastSync > 18000) {
        close(false);
        onClose(error.code === 'closed' ? error.message : 'Связь с сервером пропала.');
        return;
      }
      onRoster(null, 'retrying');
    }
    timer = setTimeout(sync, relay ? 280 : 1250);
  }

  timer = setTimeout(sync, 0);
  return {
    ...room, close,
    tick(now,pose) {
      if (!active || now - lastSent < 50 || !acceptPose(pose)) return;
      lastSent = now;
      latest = pose.map(value => Math.round(value * 10000) / 10000);
      const packet = JSON.stringify(latest);
      for (const {channel} of peers.values()) {
        if (channel?.readyState === 'open' && channel.bufferedAmount < 2048) {
          try { channel.send(packet); } catch { /* A peer can disconnect while sending. */ }
        }
      }
    },
  };
}
