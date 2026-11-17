import { importRelayKey,makeRelayIdentity,openRelay,signRelayFrame,verifyRelayFrame } from './realtime.js?v=023';

const endpoint = 'https://contour-67-rooms.bagirovtimur09.chatgpt.site/api/rooms';
const errors = {
  closed: 'Комната закрылась или хост вышел.',
  full: 'В комнате уже четыре пилота.',
  code: 'Введи шесть цифр.',
  server: 'Сервер комнат временно недоступен.',
  players: 'Для старта нужен ещё один игрок.',
  running: 'Раунд уже запущен.',
  update: 'Обнови страницу, чтобы войти в соревновательную комнату.',
  round: 'Этот раунд уже закончился.',
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

function acceptPose(pose,route) {
  return Array.isArray(pose) && pose.length === 9 && pose.every(Number.isFinite) &&
    Math.abs(pose[0]) < 150 && Math.abs(pose[1]) < 50 && pose[2] >= 60 && pose[2] <= (route==='port6' ? 5150 : 700) &&
    pose.slice(3,7).every(value => Math.abs(value) <= 1.01) &&
    Math.abs(pose[7]) < 150 && Math.abs(pose[8]) < 150;
}

export async function enterRoom({code,nick,model,color,route,mode,contacts,onRoster,onPose,onImpact,onMatch,onClose}) {
  const signing = await makeRelayIdentity();
  const room = await request({action:code ? 'join' : 'create',code,nick,model,color,route,mode,contacts,games:6,socketKey:signing?.publicKey});
  const {id,secret} = room;
  const send = (action, body, options) => request({action,id,secret,...body}, options);
  const peers = new Map();
  let sequence = 0;
  let serverOffset, bestClockRtt = Infinity, clockSyncAt = 0;
  let ws, lastBroadcast, broadcastAt = 0, signingFrame = false, roster = [];
  let timer, latest, active = true, lastSent = 0, lastSync = performance.now(), pingAt = 0, serverRtt, after = 0;

  function detach(link) {
    link.channel?.close();
    link.peer?.close();
  }

  function close(notify = true) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    ws?.close();
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
        if (!acceptPose(pose,room.route)) return;
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
    const link = {...member,started:performance.now(),lastDirect:0,lastSocket:0,verifying:0};
    if (member.socketKey && signing) link.relayKey = importRelayKey(member.socketKey).catch(() => null);
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
    return link.channel?.readyState === 'open' && now - link.lastDirect < 1500 && link.lastDirect > 0;
  }

  function socketLive(link,now) {
    return Boolean(ws?.ready && link.lastSocket && now-link.lastSocket<2600);
  }

  function notify() {
    const now = performance.now();
    const links = [...peers.values()];
    const network = Object.fromEntries(links.map(link => {
      if (direct(link,now)) return [link.id,{type:'WebRTC',rtt:link.rtt}];
      if (socketLive(link,now)) return [link.id,{type:'WebSocket',rtt:ws.rtt}];
      return [link.id,{type:'HTTPS',rtt:serverRtt}];
    }));
    const state = !links.length ? 'waiting' :
      links.every(link=>direct(link,now)) ? 'direct' :
      links.every(link=>direct(link,now) || socketLive(link,now)) ? 'socket' :
      links.every(link=>now-link.started<3000) ? 'connecting' : 'relay';
    onRoster(roster,state,network);
  }

  async function receiveSocket(packet) {
    const {frame,signature} = packet ?? {};
    if (!Array.isArray(frame) || frame.length!==3 ||
        typeof signature!=='string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return;
    const [sender,number,pose] = frame;
    const link = peers.get(sender);
    if (!link?.relayKey || link.verifying>=2 || !Number.isSafeInteger(number) ||
        number<1 || number<=(link.socketSequence ?? 0) || !acceptPose(pose,room.route)) return;
    link.verifying++;
    try {
      const key = await link.relayKey;
      if (!key || !await verifyRelayFrame(key,frame,signature) || !active || peers.get(sender)!==link ||
          number<=(link.socketSequence ?? 0)) return;
      link.socketSequence = number;
      const now = performance.now();
      const previouslyActive = socketLive(link,now);
      link.lastSocket = now;
      if (!direct(link,now)) onPose(link,pose,'socket');
      if (!previouslyActive) notify();
    } catch { /* A malformed frame is ignored. */ }
    finally { link.verifying--; }
  }

  function publishSocket(now) {
    if (!ws?.ready || signingFrame || ![...peers.values()].some(link=>link.relayKey && !direct(link,now))) return;
    const interval = peers.size >= 3 ? 205 : peers.size===2 ? 170 : 130;
    if (now-broadcastAt<interval) return;
    if (lastBroadcast && now-broadcastAt<800 && latest.every((value,i)=>Math.abs(value-lastBroadcast[i])<.002)) return;
    const frame = [id,sequence,latest];
    signingFrame = true;
    signRelayFrame(signing.key,frame).then(signature => {
      if (active && ws.publish(frame,signature)) {
        broadcastAt = performance.now();
        lastBroadcast = frame[2];
      }
    }).catch(() => {}).finally(() => { signingFrame = false; });
  }

  function matchClock(match,started) {
    if (!active || !match || !Number.isFinite(match.serverNow)) return;
    const now = performance.now();
    const rtt = now-started;
    if (rtt<=bestClockRtt+25 || now-clockSyncAt>18000) {
      if (now-clockSyncAt>18000) bestClockRtt = Infinity;
      bestClockRtt = Math.min(bestClockRtt,rtt);
      const offset = match.serverNow-(started+now)/2;
      serverOffset = serverOffset===undefined ? offset : serverOffset*.75+offset*.25;
      clockSyncAt = now;
    }
    onMatch?.(match.round,match.serverNow);
  }

  async function roundAction(action,payload) {
    const now = performance.now();
    const result = await send(action,payload);
    matchClock(result,now);
  }

  async function sync() {
    if (!active) return;
    const now = performance.now();
    const relay = [...peers.values()].some(link => !direct(link,now) && !socketLive(link,now));
    try {
      const response = await send('sync', {relay,mirror:true,pose:latest,after,
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
      roster = response.peers;
      const host = roster.find(member=>member.slot===0);
      if (signing && !ws && host?.socketKey) {
        ws = openRelay(host.id,{onFrame:receiveSocket,onStatus:notify});
      }
      const connected = new Set(roster.map(member => member.id));
      for (const [key,link] of peers) {
        if (connected.has(key)) continue;
        detach(link);
        peers.delete(key);
      }
      for (const member of roster) {
        if (member.id === id) continue;
        const link = peers.get(member.id) ?? add(member);
        if (member.pose && !direct(link,lastSync) && !socketLive(link,lastSync)) onPose(link, member.pose, 'https');
      }
      if (response.match) matchClock(response.match,now);
      for (const signal of response.signals) void acceptSignal(peers.get(signal.from), signal.sdp);
      notify();
    } catch (error) {
      if (!active) return;
      if (error.code === 'closed' || performance.now() - lastSync > 18000) {
        close(false);
        onClose(error.code === 'closed' ? error.message : 'Связь с сервером пропала.');
        return;
      }
      onRoster(null, 'retrying');
    }
    timer = setTimeout(sync,room.contacts ? 120 : relay ? 125 : 1000);
  }

  timer = setTimeout(sync, 0);
  return {
    ...room, close,
    get serverNow() { return serverOffset===undefined ? Date.now() : performance.now()+serverOffset; },
    startRound() { return roundAction('startRound',{}); },
    report(round,result) { return roundAction('result',{round,...result}); },
    tick(now,pose) {
      if (!active || now - lastSent < 50 || !acceptPose(pose,room.route)) return;
      lastSent = now;
      latest = pose.map(value => Math.round(value * 10000) / 10000);
      const packet = JSON.stringify({pose:latest,seq:++sequence});
      publishSocket(now);
      const measure = now-pingAt>=1000;
      if (measure) pingAt = now;
      for (const link of peers.values()) {
        const {channel} = link;
        if (channel?.readyState === 'open' && channel.bufferedAmount < 2048) {
          try {
            channel.send(link.socketKey ? packet : JSON.stringify(latest));
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
