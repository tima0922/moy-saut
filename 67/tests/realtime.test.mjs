import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { importRelayKey,makeRelayIdentity,openRelay,signRelayFrame,verifyRelayFrame } from '../js/realtime.js';

test('room relay signatures validate only the original player and pose', async () => {
  const sender = await makeRelayIdentity();
  const other = await makeRelayIdentity();
  assert.match(sender.publicKey,/^B[A-Za-z0-9_-]{86}$/);
  const packet = ['sender',3,[1,0,135,0,0,0,1,0,1]];
  const sig = await signRelayFrame(sender.key,packet);
  assert.equal(await verifyRelayFrame(await importRelayKey(sender.publicKey),packet,sig),true);
  assert.equal(await verifyRelayFrame(await importRelayKey(other.publicKey),packet,sig),false);
  assert.equal(await verifyRelayFrame(await importRelayKey(sender.publicKey),['sender',4,packet[2]],sig),false);
});

test('relay waits for a join acknowledgement, measures RTT and stops on room exit', async () => {
  const original = globalThis.WebSocket;
  const created = new EventTarget();
  const sent = [];
  let socket;
  globalThis.WebSocket = class FakeSocket {
    static OPEN = 1;
    bufferedAmount = 0;
    readyState = 0;
    constructor() {
      socket = this;
      created.dispatchEvent(new Event('socket'));
    }
    send(data) { sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.onclose?.(); }
    reply(message) { this.onmessage({data:JSON.stringify(message)}); }
  };
  const received = [];
  const relay = openRelay('host',{onFrame:frame=>received.push(frame),onStatus() {}});
  try {
    await once(created,'socket');
    socket.readyState = 1;
    socket.onopen();
    const [join] = sent;
    assert.equal(join.event,'phx_join');
    assert.equal(relay.publish(['guest',1,[]],'test'),false);
    socket.reply({topic:join.topic,ref:join.ref,event:'phx_reply',payload:{status:'ok'}});
    const heartbeat = sent.at(-1);
    assert.equal(heartbeat.event,'heartbeat');
    socket.reply({topic:heartbeat.topic,ref:heartbeat.ref,event:'phx_reply',payload:{status:'ok'}});
    assert.ok(Number.isFinite(relay.rtt));
    assert.equal(relay.publish(['guest',1,[]],'test'),true);
    const frame = sent.at(-1);
    socket.reply({...frame,topic:'realtime:another-room'});
    socket.reply(frame);
    assert.deepEqual(received,[frame.payload.payload]);
    relay.close();
    assert.equal(socket.readyState,3);
    assert.equal(relay.publish(['guest',2,[]],'test'),false);
  } finally {
    relay.close();
    globalThis.WebSocket = original;
  }
});
