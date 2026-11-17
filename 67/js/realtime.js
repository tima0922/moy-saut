const endpoint = 'wss://dnxytuqhbhoyfwqydnsn.supabase.co/realtime/v1/websocket';
const publishableKey = 'sb_publishable_hw0rZ5u4xSGMOuNaWUirwA_JfiY3XRn';
const algorithm = {name:'ECDSA',namedCurve:'P-256'};
const proof = {name:'ECDSA',hash:'SHA-256'};
const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode = base64 => Uint8Array.from(atob(base64.replaceAll('-','+').replaceAll('_','/')),value=>value.charCodeAt(0));

export async function makeRelayIdentity() {
  if (!globalThis.WebSocket || !globalThis.crypto?.subtle) return null;
  try {
    const keys = await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
    return {
      key:keys.privateKey,
      publicKey:base64url(await crypto.subtle.exportKey('raw',keys.publicKey)),
    };
  } catch {
    return null;
  }
}

export const importRelayKey = key => crypto.subtle.importKey('raw',decode(key),algorithm,false,['verify']);
export async function signRelayFrame(key, frame) {
  return base64url(await crypto.subtle.sign(proof,key,encoder.encode(JSON.stringify(frame))));
}
export async function verifyRelayFrame(key, frame, signature) {
  return crypto.subtle.verify(proof,key,decode(signature),encoder.encode(JSON.stringify(frame)));
}

export function openRelay(host, {onFrame,onStatus}) {
  const topic = 'realtime:contour67-v1-' + host;
  let socket, timer, reconnect, epoch = 0, ref = 0, joined = false, closed = false;
  let rtt, awaiting, failures = 0;

  function send(topic,event,payload,ref = null) {
    if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 4096) return false;
    socket.send(JSON.stringify({topic,event,payload,ref}));
    return true;
  }

  function connect() {
    if (closed) return;
    const generation = ++epoch;
    const url = new URL(endpoint);
    url.searchParams.set('apikey',publishableKey);
    url.searchParams.set('vsn','1.0.0');
    socket = new WebSocket(url);
    const current = socket;
    const joinRef = String(++ref);
    timer = setTimeout(() => current.close(4000,'join timeout'),6500);

    current.onopen = () => {
      send(topic,'phx_join',{config:{broadcast:{ack:false,self:false},private:false},join_ref:joinRef},joinRef);
    };
    function heartbeat() {
      const key = String(++ref);
      awaiting = {key,sent:performance.now()};
      send('phoenix','heartbeat',{},key);
      timer = setTimeout(() => current.close(4000,'heartbeat timeout'),5500);
    }
    current.onmessage = ({data}) => {
      if (closed || generation !== epoch || typeof data !== 'string' || data.length > 4096) return;
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.event === 'phx_reply') {
        if (message.topic === topic && message.ref === joinRef && !joined) {
          if (message.payload?.status !== 'ok') {
            current.close(4001,'join rejected');
            return;
          }
          clearTimeout(timer);
          joined = true;
          onStatus();
          heartbeat();
        } else if (message.topic === 'phoenix' && message.ref === awaiting?.key && message.payload?.status === 'ok') {
          const sample = performance.now()-awaiting.sent;
          rtt = rtt === undefined ? sample : .75*rtt+.25*sample;
          awaiting = null;
          failures = 0;
          clearTimeout(timer);
          timer = setTimeout(heartbeat,3500);
          onStatus();
        }
        return;
      }
      if (message.topic !== topic) return;
      if (message.event === 'phx_error' || message.event === 'phx_close' ||
          message.event === 'system' && message.payload?.status === 'error') {
        current.close(4001,'channel interrupted');
      } else if (joined && message.event === 'broadcast' && message.payload?.event === 'pose') {
        onFrame(message.payload.payload);
      }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (closed || generation !== epoch) return;
      joined = false;
      awaiting = null;
      rtt = undefined;
      clearTimeout(timer);
      onStatus();
      const wait = Math.min(16000,1000*2**Math.min(failures++,4));
      reconnect = setTimeout(connect,wait+Math.random()*450);
    };
  }

  // Defer connection so callbacks can access the returned relay instance.
  reconnect = setTimeout(connect,0);
  return {
    get ready() { return joined; },
    get rtt() { return rtt; },
    publish(frame,signature) {
      if (!joined) return false;
      return send(topic,'broadcast',{type:'broadcast',event:'pose',payload:{frame,signature}});
    },
    close() {
      closed = true;
      joined = false;
      clearTimeout(timer);
      clearTimeout(reconnect);
      socket?.close(1000,'room closed');
    },
  };
}
