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
    Math.abs(pose[0]) < 150 && Math.abs(pose[1]) < 50 && pose[2] >= 60 && pose[2] <= 460 &&
    pose.slice(3,7).every(value => Math.abs(value) <= 1.01) &&
    Math.abs(pose[7]) < 150 && Math.abs(pose[8]) < 150;
}

export async function enterRoom({code,nick,model,color,route,contacts,onRoster,onPose,onImpact,onClose}) {
  const room = await request({action:code ? 'join' : 'create',code,nick,model,color,route,contacts});
  const {id,secret} = room;
  const send = (action, body, options) => request({action,id,secret,...body}, options);
  const peers = new Map();
  let sequence = 0;
  let timer, latest, active = true, lastSent = 0, lastSync = performance.now(), pingAt = 0, serverRtt, after = 0;

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
      if (!active || peers.get(link.id) !== link || typeof event.data !== 'string' || event.data.length > 520) return;
      try {
        const packet = JSON.parse(event.data);
        if (Number.isInteger(packet?.ping)) {
          channel.send(JSON.stringify({pong:packet.ping}));
          return;
        }
        if (packet?.pong === link.ping && link.ping) {
          const rtt = performance.now()-link.ping;
          link.rtt = link.rtt === undefined ? rtt : link.rtt*.7+rtt*.3;
          link.ping = 0;
          return;
        }
        const pose = Array.isArray(packet) ? packet : packet?.pose;
        if (!acceptPose(pose)) return;
        if (Number.isSafeInteger(packet.seq)) {
          if (packet.seq <= (link.sequence ?? -1)) return;
          link.sequence = packet.seq;
        }
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
    const keepPose = relay || room.contacts;
    try {
      const response = await send('sync', {relay, pose:keepPose ? latest : undefined,after,
        signals:[...peers.values()].some(link => !link.handled)});
      if (!active) return;
      lastSync = performance.now();
      const rtt = lastSync-now;
      serverRtt = serverRtt === undefined ? rtt : serverRtt*.72+rtt*.28;
      for (const impact of response.impacts ?? []) {
        if (impact.seq <= after) continue;
        after = impact.seq;
        onImpact?.(impact.correction);
      }
      const connected = new Set(response.peers.map(member => member.id));
      for (const [key,link] of peers) {
        if (connected.has(key)) continue;
        detach(link);
        peers.delete(key);
      }
      for (const member of response.peers) {
        if (member.id === id) continue;
        const link = peers.get(member.id) ?? add(member);
        if (member.pose && !direct(link, lastSync)) onPose(link, member.pose, 'https');
      }
      for (const signal of response.signals) void acceptSignal(peers.get(signal.from), signal.sdp);
      const links = [...peers.values()];
      const network = Object.fromEntries(links.map(link => [link.id,direct(link,lastSync) ?
        {type:'WebRTC',rtt:link.rtt} : {type:'HTTPS',rtt:serverRtt}]));
      onRoster(response.peers, links.every(link => direct(link,lastSync)) ? (links.length ? 'direct' : 'waiting') :
        links.some(link => !direct(link,lastSync) && lastSync - link.started > 6500) ? 'relay' : 'connecting',network);
    } catch (error) {
      if (!active) return;
      if (error.code === 'closed' || performance.now() - lastSync > 18000) {
        close(false);
        onClose(error.code === 'closed' ? error.message : 'Связь с сервером пропала.');
        return;
      }
      onRoster(null, 'retrying');
    }
    timer = setTimeout(sync, room.contacts ? 120 : relay ? 125 : 1000);
  }

  timer = setTimeout(sync, 0);
  return {
    ...room, close,
    tick(now,pose) {
      if (!active || now - lastSent < 50 || !acceptPose(pose)) return;
      lastSent = now;
      latest = pose.map(value => Math.round(value * 10000) / 10000);
      const packet = JSON.stringify({pose:latest,seq:++sequence});
      const measure = now-pingAt>=1000;
      if (measure) pingAt = now;
      for (const link of peers.values()) {
        const {channel} = link;
        if (channel?.readyState === 'open' && channel.bufferedAmount < 2048) {
          try {
            channel.send(packet);
            if (measure) {
              link.ping = Math.round(performance.now());
              channel.send(JSON.stringify({ping:link.ping}));
            }
          } catch { /* A peer can disconnect while sending. */ }
        }
      }
    },
  };
}
