const MARK_FREQ = 1200; // bit 1
const SPACE_FREQ = 2200; // bit 0
const BAUD_RATE = 200; // 200 bps UART-over-FSK (~20 bytes/s)

const DTMF_MAP = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
};

export function crc16Ccitt(bytes) {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function encodePacketFrame(payloadText, seq = 1) {
  const payload = new TextEncoder().encode(payloadText);
  if (payload.length === 0 || payload.length > 180) {
    throw new Error(`Payload fuera de rango: ${payload.length}`);
  }
  const body = new Uint8Array(2 + payload.length);
  body[0] = seq & 0xff;
  body[1] = payload.length & 0xff;
  body.set(payload, 2);
  const crc = crc16Ccitt(body);

  // Preamble: 0xAA, 0xAA, SFD: 0x55, 0xD3
  const frame = new Uint8Array(4 + body.length + 2);
  frame[0] = 0xaa;
  frame[1] = 0xaa;
  frame[2] = 0x55;
  frame[3] = 0xd3;
  frame.set(body, 4);
  frame[4 + body.length] = (crc >> 8) & 0xff;
  frame[4 + body.length + 1] = crc & 0xff;
  return frame;
}

function appendByteAsUartBits(bits, byteVal) {
  bits.push(0); // start bit
  for (let b = 0; b < 8; b++) {
    bits.push((byteVal >> b) & 1); // LSB first
  }
  bits.push(1); // stop bit
}

export function modulatePacketToPcm(payloadText, { sampleRate = 48000, baudRate = BAUD_RATE, seq = 1, volume = 0.55 } = {}) {
  const frame = encodePacketFrame(payloadText, seq);
  const bits = [];
  for (let i = 0; i < 14; i++) bits.push(1); // Mark warmup for mic AGC & receiver lock
  for (let i = 0; i < frame.length; i++) {
    appendByteAsUartBits(bits, frame[i]);
  }
  for (let i = 0; i < 4; i++) bits.push(1); // Postamble mark

  const samplesPerBit = Math.max(24, Math.round(sampleRate / baudRate));
  const totalSamples = bits.length * samplesPerBit;
  const pcm = new Float32Array(totalSamples);

  let phase = 0;
  let idx = 0;
  const fadeSamples = Math.min(samplesPerBit, Math.floor(sampleRate * 0.008));

  for (let i = 0; i < bits.length; i++) {
    const freq = bits[i] === 1 ? MARK_FREQ : SPACE_FREQ;
    const step = (2 * Math.PI * freq) / sampleRate;
    for (let s = 0; s < samplesPerBit; s++) {
      let env = 1;
      if (idx < fadeSamples) env = idx / fadeSamples;
      else if (totalSamples - idx < fadeSamples) env = (totalSamples - idx) / fadeSamples;
      pcm[idx++] = Math.sin(phase) * volume * env;
      phase += step;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
  }
  return { pcm, sampleRate, baudRate, samplesPerBit, frameLength: frame.length };
}

function goertzelPower(samples, start, len, targetFreq, sampleRate) {
  const omega = (2 * Math.PI * targetFreq) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < len; i++) {
    const q0 = coeff * q1 - q2 + samples[start + i];
    q2 = q1;
    q1 = q0;
  }
  return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
}

export class FskStreamDecoder {
  constructor({ sampleRate = 48000, baudRate = BAUD_RATE, onPacket, onLevel } = {}) {
    this.sampleRate = sampleRate;
    this.baudRate = baudRate;
    this.samplesPerBit = Math.max(24, Math.round(sampleRate / baudRate));
    this.winLen = Math.max(16, Math.round(this.samplesPerBit * 0.72));
    this.onPacket = onPacket || (() => {});
    this.onLevel = onLevel || (() => {});

    this.ring = new Float32Array(this.samplesPerBit * 24);
    this.ringLen = 0;
    this.sampleCursor = 0;
    this.prevBit = 1;
    this.parserState = 'WAIT_START';
    this.nextSampleAt = 0;
    this.bitIndex = 0;
    this.curByte = 0;
    this.recentBytes = [];
    this.frameState = 'SYNC';
    this.frameBytes = [];
    this.expectedLen = 0;
    this.lastSeq = -1;
    this.lastPayload = '';
  }

  resetParser() {
    this.parserState = 'WAIT_START';
    this.frameState = 'SYNC';
    this.frameBytes = [];
    this.expectedLen = 0;
  }

  evalBitAt(centerSampleIndex) {
    const start = Math.max(0, Math.floor(centerSampleIndex - this.winLen / 2));
    if (start + this.winLen > this.ringLen) return null;
    const pMark = goertzelPower(this.ring, start, this.winLen, MARK_FREQ, this.sampleRate);
    const pSpace = goertzelPower(this.ring, start, this.winLen, SPACE_FREQ, this.sampleRate);
    let energy = 0;
    for (let i = 0; i < this.winLen; i++) {
      const v = this.ring[start + i];
      energy += v * v;
    }
    const signalPower = Math.max(pMark, pSpace);
    const norm = energy * this.winLen * 0.08 + 1e-9;
    const active = signalPower > norm && (pMark + pSpace) > 1e-6;
    const bit = pMark >= pSpace ? 1 : 0;
    return { bit, active, strength: Math.min(1, Math.sqrt(energy / this.winLen) * 3.5) };
  }

  pushSamples(chunk) {
    if (!chunk || chunk.length === 0) return;
    if (this.ringLen + chunk.length > this.ring.length) {
      const newCap = Math.max(this.ring.length * 2, this.ringLen + chunk.length + this.samplesPerBit * 16);
      const next = new Float32Array(newCap);
      next.set(this.ring.subarray(0, this.ringLen));
      this.ring = next;
    }
    this.ring.set(chunk, this.ringLen);
    this.ringLen += chunk.length;

    const spb = this.samplesPerBit;
    const step = Math.max(4, Math.floor(spb / 10));

    while (this.sampleCursor + spb * 10 <= this.ringLen) {
      if (this.parserState === 'WAIT_START') {
        const res = this.evalBitAt(this.sampleCursor + Math.floor(this.winLen / 2));
        if (!res) break;
        this.onLevel(res.strength, res.bit);

        if (res.active && this.prevBit === 1 && res.bit === 0) {
          // Verify falling edge truly enters a start bit 0 halfway into this bit cell
          const halfRes = this.evalBitAt(this.sampleCursor + Math.floor(spb * 0.52));
          if (halfRes && halfRes.active && halfRes.bit === 0) {
            this.parserState = 'READ_BYTE';
            this.curByte = 0;
            this.bitIndex = 0;
            this.nextSampleAt = this.sampleCursor + Math.round(spb * 1.5);
            this.prevBit = 0;
            continue;
          }
        }
        this.prevBit = res.bit;
        this.sampleCursor += step;
      } else {
        if (this.sampleCursor < this.nextSampleAt) {
          this.sampleCursor = this.nextSampleAt;
        }
        const res = this.evalBitAt(this.sampleCursor);
        if (!res) break;
        this.onLevel(res.strength, res.bit);

        if (this.bitIndex < 8) {
          if (res.bit === 1) this.curByte |= (1 << this.bitIndex);
          this.bitIndex += 1;
          this.nextSampleAt += spb;
        } else {
          // Stop bit
          if (res.bit === 1 || this.frameState === 'BODY') {
            this.onByte(this.curByte);
          } else {
            this.resetParser();
          }
          this.prevBit = res.bit;
          this.parserState = 'WAIT_START';
          this.sampleCursor += Math.floor(spb * 0.25);
        }
      }
    }

    // Compact consumed ring buffer
    const keepFrom = Math.max(0, this.sampleCursor - spb * 2);
    if (keepFrom > 0 && keepFrom < this.ringLen) {
      this.ring.copyWithin(0, keepFrom, this.ringLen);
      this.ringLen -= keepFrom;
      this.sampleCursor -= keepFrom;
      this.nextSampleAt -= keepFrom;
    }
  }

  onByte(byteVal) {
    if (this.frameState === 'SYNC') {
      this.recentBytes.push(byteVal);
      if (this.recentBytes.length > 4) this.recentBytes.shift();
      const n = this.recentBytes.length;
      if (n >= 2 && this.recentBytes[n - 2] === 0x55 && this.recentBytes[n - 1] === 0xd3) {
        this.frameState = 'BODY';
        this.frameBytes = [];
        this.expectedLen = 0;
      }
      return;
    }

    this.frameBytes.push(byteVal);
    if (this.frameBytes.length === 2) {
      this.expectedLen = byteVal;
      if (this.expectedLen < 1 || this.expectedLen > 180) {
        this.resetParser();
      }
      return;
    }

    if (this.expectedLen > 0 && this.frameBytes.length === 4 + this.expectedLen) {
      const body = new Uint8Array(this.frameBytes.slice(0, 2 + this.expectedLen));
      const rxCrc = (this.frameBytes[2 + this.expectedLen] << 8) | this.frameBytes[3 + this.expectedLen];
      const calcCrc = crc16Ccitt(body);
      const seq = body[0];
      const payloadText = new TextDecoder().decode(body.subarray(2));
      this.resetParser();

      if (rxCrc === calcCrc) {
        if (seq === this.lastSeq && payloadText === this.lastPayload) {
          return; // Deduplicate identical retransmission
        }
        this.lastSeq = seq;
        this.lastPayload = payloadText;
        this.onPacket(payloadText, { seq, crc: calcCrc });
      }
    }
  }
}

export function serializeLegacyPacket(packet) {
  switch (packet.type) {
    case 'host_offer': {
      const seed36 = packet.mapSeed ? (Number(packet.mapSeed) >>> 0).toString(36) : '';
      return `H|${packet.tankTypeId}|${packet.armorId}|${packet.mapStyle}|${seed36}`;
    }
    case 'guest_join':
      return `J|${packet.tankTypeId}|${packet.armorId}`;
    case 'move_step':
      return `M|${packet.actorTeam}|${Math.sign(packet.dx)}|${Math.sign(packet.dy)}`;
    case 'move_to':
      return `P|${packet.actorTeam}|${Math.round(packet.x)}|${Math.round(packet.y)}`;
    case 'shoot': {
      const a = Math.round((Number(packet.angle) || 0) * 10000);
      const tx = Math.round((Number(packet.targetX) || 0) * 10);
      const ty = Math.round((Number(packet.targetY) || 0) * 10);
      return `S|${packet.actorTeam}|${packet.mode || 'normal'}|${a}|${tx}|${ty}`;
    }
    case 'switch_control':
      return `C|${packet.actorTeam}|${packet.target}`;
    case 'end_turn':
      return `E|${packet.actorTeam}`;
    case 'rematch': {
      const seed36 = packet.mapSeed ? (Number(packet.mapSeed) >>> 0).toString(36) : '';
      return `R|${packet.mapStyle}|${packet.p1TankTypeId}|${packet.p1ArmorId}|${packet.p2TankTypeId}|${packet.p2ArmorId}|${seed36}`;
    }
    default:
      throw new Error(`Paquete Legacy desconocido: ${packet.type}`);
  }
}

export function parseLegacyPacket(text) {
  const parts = String(text || '').split('|');
  const code = parts[0];
  switch (code) {
    case 'H':
      return {
        type: 'host_offer',
        tankTypeId: parts[1],
        armorId: parts[2],
        mapStyle: parts[3],
        mapSeed: parts[4] ? parseInt(parts[4], 36) : null
      };
    case 'J':
      return { type: 'guest_join', tankTypeId: parts[1], armorId: parts[2] };
    case 'M':
      return { type: 'move_step', actorTeam: parts[1], dx: Number(parts[2]), dy: Number(parts[3]) };
    case 'P':
      return { type: 'move_to', actorTeam: parts[1], x: Number(parts[2]), y: Number(parts[3]) };
    case 'S':
      return {
        type: 'shoot',
        actorTeam: parts[1],
        mode: parts[2],
        angle: Number(parts[3]) / 10000,
        targetX: Number(parts[4]) / 10,
        targetY: Number(parts[5]) / 10
      };
    case 'C':
      return { type: 'switch_control', actorTeam: parts[1], target: parts[2] };
    case 'E':
      return { type: 'end_turn', actorTeam: parts[1] };
    case 'R':
      return {
        type: 'rematch',
        mapStyle: parts[1],
        p1TankTypeId: parts[2],
        p1ArmorId: parts[3],
        p2TankTypeId: parts[4],
        p2ArmorId: parts[5],
        mapSeed: parts[6] ? parseInt(parts[6], 36) : null
      };
    default:
      return null;
  }
}

// =========================================================================
// Web Audio 1990s 56k Modem Synthesizer & Browser Transceiver Controller
// =========================================================================

class LegacyModemController {
  constructor() {
    this.ctx = null;
    this.channel = null;
    this.micStream = null;
    this.micSource = null;
    this.micProcessor = null;
    this.decoder = null;
    this.listening = false;
    this.transport = 'loopback'; // 'acoustic' | 'loopback'
    this.txSeq = 1;
    this.txMuteUntil = 0;
    this.lastSentPayload = null;
    this.onPacketCb = () => {};
    this.onLedCb = () => {};
    this.onStatusCb = () => {};
    this.onLevelCb = () => {};
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setCallbacks({ onPacket, onLed, onStatus, onLevel }) {
    if (onPacket) this.onPacketCb = onPacket;
    if (onLed) this.onLedCb = onLed;
    if (onStatus) this.onStatusCb = onStatus;
    if (onLevel) this.onLevelCb = onLevel;
  }

  initDecoder(sampleRate) {
    this.decoder = new FskStreamDecoder({
      sampleRate,
      baudRate: BAUD_RATE,
      onPacket: (text, meta) => {
        this.onLedCb('rx', true);
        setTimeout(() => this.onLedCb('rx', false), 320);
        const parsed = parseLegacyPacket(text);
        if (parsed) {
          this.onPacketCb(parsed, text, meta);
        }
      },
      onLevel: (strength, bit) => {
        this.onLevelCb(strength, bit);
      }
    });
  }

  playTone(startAt, duration, freqA, freqB = 0, gainVal = 0.14, type = 'sine') {
    const ctx = this.ensureContext();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(gainVal, startAt + 0.008);
    g.gain.setValueAtTime(gainVal, Math.max(startAt + 0.01, startAt + duration - 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    g.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = type;
    o1.frequency.setValueAtTime(freqA, startAt);
    o1.connect(g);
    o1.start(startAt);
    o1.stop(startAt + duration + 0.01);

    if (freqB > 0) {
      const o2 = ctx.createOscillator();
      o2.type = type;
      o2.frequency.setValueAtTime(freqB, startAt);
      o2.connect(g);
      o2.start(startAt);
      o2.stop(startAt + duration + 0.01);
    }
  }

  playNoiseBurst(startAt, duration, centerFreq, qVal, gainVal = 0.16, modRate = 0) {
    const ctx = this.ensureContext();
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const mod = modRate > 0 ? (0.55 + 0.45 * Math.sin((2 * Math.PI * modRate * i) / ctx.sampleRate)) : 1;
      data[i] = (Math.random() * 2 - 1) * mod;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startAt);
    filter.Q.setValueAtTime(qVal, startAt);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(gainVal, startAt + 0.02);
    g.gain.setValueAtTime(gainVal, Math.max(startAt + 0.025, startAt + duration - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(startAt);
    src.stop(startAt + duration + 0.01);
  }

  playRelayClick(startAt) {
    this.playNoiseBurst(startAt, 0.025, 1900, 1.2, 0.25, 0);
  }

  /**
   * Authentic 1990s USRobotics / Hayes V.90 56k dial-up connection sequence.
   */
  async playDialupHandshake(role = 'host') {
    const ctx = this.ensureContext();
    let t = ctx.currentTime + 0.04;
    const totalMs = role === 'host' ? 2550 : 1950;
    this.txMuteUntil = performance.now() + totalMs + 150;
    this.onLedCb('hs', true);
    this.onStatusCb(role === 'host' ? 'Marcando DTMF y negociando portadora V.90...' : 'Descolgando línea y emitiendo tono CED 2100 Hz...');

    // 1. Mechanical relay click off-hook
    this.playRelayClick(t);
    t += 0.06;

    if (role === 'host') {
      // 2. Dial tone 350Hz + 440Hz
      this.playTone(t, 0.34, 350, 440, 0.11);
      t += 0.38;

      // 3. DTMF sequence ("9056994")
      const digits = '9056994';
      for (const ch of digits) {
        const [f1, f2] = DTMF_MAP[ch];
        this.playTone(t, 0.055, f1, f2, 0.14);
        t += 0.082;
      }
      t += 0.08;

      // 4. Short ringback pulse
      this.playTone(t, 0.24, 440, 480, 0.09);
      t += 0.30;
    }

    // 5. Iconic 2100 Hz CED answer tone + phase inversion buzz
    this.playTone(t, 0.42, 2100, 0, 0.14);
    this.playTone(t + 0.14, 0.08, 2100, 15, 0.08, 'triangle');
    t += 0.45;

    // 6. V.8bis / V.32bis FSK warble + Bong-Bong-Kshhh training screech
    this.playTone(t, 0.12, 980, 1650, 0.13);
    this.playTone(t + 0.12, 0.12, 1180, 1850, 0.13);
    this.playTone(t + 0.24, 0.16, 1375, 2002, 0.14);
    t += 0.41;

    // 7. Two signature V.34/V.90 carrier negotiation screeches (bandpassed QAM static)
    this.playNoiseBurst(t, 0.34, 1550, 2.2, 0.22, 180);
    this.playTone(t, 0.34, 600, 2400, 0.07, 'sawtooth');
    t += 0.37;

    this.playNoiseBurst(t, 0.36, 1950, 1.4, 0.24, 620);
    this.playTone(t, 0.18, 1200, 2200, 0.08, 'square');
    t += 0.40;

    this.playRelayClick(t);
    setTimeout(() => {
      this.onLedCb('hs', false);
      this.onLedCb('cd', true);
    }, totalMs);
    return totalMs;
  }

  playDataModemPreamble(startAt) {
    // Brief 90s carrier squawk before data burst so every turn sounds distinctly analog-modem
    this.playNoiseBurst(startAt, 0.09, 1750, 2.8, 0.14, 340);
    this.playTone(startAt, 0.06, 2100, 1650, 0.07);
    return 0.1;
  }

  playPcmBuffer(pcm, sampleRate, addModemPreamble = true) {
    const ctx = this.ensureContext();
    let startAt = ctx.currentTime + 0.02;
    if (addModemPreamble) {
      startAt += this.playDataModemPreamble(startAt);
    }

    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Slight telephone-line bandpass for authentic 90s speaker texture (still keeps 1200/2200Hz crisp!)
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(300, startAt);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3400, startAt);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(ctx.destination);
    src.start(startAt);

    const durationMs = Math.ceil((pcm.length / sampleRate) * 1000) + (addModemPreamble ? 140 : 40);
    return durationMs;
  }

  async sendPacket(packetObj, { withAudio = true } = {}) {
    const payload = serializeLegacyPacket(packetObj);
    this.lastSentPayload = payload;
    this.txSeq = (this.txSeq + 1) & 0xff || 1;

    const ctx = this.ensureContext();
    const { pcm, sampleRate } = modulatePacketToPcm(payload, {
      sampleRate: ctx.sampleRate,
      baudRate: BAUD_RATE,
      seq: this.txSeq,
      volume: 0.55
    });

    this.onLedCb('tx', true);
    let durMs = Math.ceil((pcm.length / sampleRate) * 1000) + 160;
    if (withAudio) {
      this.txMuteUntil = performance.now() + durMs + 120;
      durMs = this.playPcmBuffer(pcm, sampleRate, true);
    }

    if (this.transport === 'loopback') {
      this.ensureBroadcastChannel();
      this.channel.postMessage({
        kind: 'fsk_pcm',
        tabId: this.tabId,
        sampleRate,
        pcm
      });
    }

    setTimeout(() => this.onLedCb('tx', false), Math.min(durMs, 900));
    return { payload, durationMs: durMs };
  }

  async resendLastPacket() {
    if (!this.lastSentPayload) return false;
    const ctx = this.ensureContext();
    this.txSeq = (this.txSeq + 1) & 0xff || 1;
    const { pcm, sampleRate } = modulatePacketToPcm(this.lastSentPayload, {
      sampleRate: ctx.sampleRate,
      baudRate: BAUD_RATE,
      seq: this.txSeq,
      volume: 0.62
    });
    this.onLedCb('tx', true);
    this.txMuteUntil = performance.now() + Math.ceil((pcm.length / sampleRate) * 1000) + 220;
    const durMs = this.playPcmBuffer(pcm, sampleRate, true);
    if (this.transport === 'loopback') {
      this.ensureBroadcastChannel();
      this.channel.postMessage({
        kind: 'fsk_pcm',
        tabId: this.tabId,
        sampleRate,
        pcm
      });
    }
    setTimeout(() => this.onLedCb('tx', false), Math.min(durMs, 900));
    return true;
  }

  ensureBroadcastChannel() {
    if (!this.tabId) {
      this.tabId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!this.channel) {
      this.channel = new BroadcastChannel('tanques-legacy-modem-v1');
      this.channel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.tabId === this.tabId) return;
        if (msg.kind === 'fsk_pcm' && msg.pcm && this.transport === 'loopback' && this.listening) {
          if (!this.decoder || this.decoder.sampleRate !== msg.sampleRate) {
            this.initDecoder(msg.sampleRate);
          }
          const samples = msg.pcm instanceof Float32Array ? msg.pcm : new Float32Array(msg.pcm);
          this.decoder.pushSamples(samples);
        }
      };
    }
  }

  async startListening(transport = 'acoustic') {
    await this.stopListening();
    this.transport = transport;
    this.listening = true;
    const ctx = this.ensureContext();

    if (transport === 'loopback') {
      this.ensureBroadcastChannel();
      this.initDecoder(ctx.sampleRate);
      this.onLedCb('cd', true);
      this.onStatusCb('Línea Virtual 56k lista (Mismo PC / Cable Audio + Goertzel FSK).');
      return { ok: true, transport: 'loopback' };
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      this.initDecoder(ctx.sampleRate);
      this.micSource = ctx.createMediaStreamSource(this.micStream);
      this.micProcessor = ctx.createScriptProcessor(2048, 1, 1);

      const silenceSink = ctx.createGain();
      silenceSink.gain.value = 0;

      this.micProcessor.onaudioprocess = (e) => {
        if (!this.listening) return;
        if (performance.now() < this.txMuteUntil) {
          this.onLevelCb(0.05, 1);
          return; // Half-duplex mute while local speaker transmits
        }
        const input = e.inputBuffer.getChannelData(0);
        this.decoder.pushSamples(input);
      };

      this.micSource.connect(this.micProcessor);
      this.micProcessor.connect(silenceSink);
      silenceSink.connect(ctx.destination);

      this.onLedCb('cd', true);
      this.onStatusCb(`Micrófono escuchando FSK (${ctx.sampleRate} Hz @ ${BAUD_RATE} bps).`);
      return { ok: true, transport: 'acoustic' };
    } catch (err) {
      this.listening = false;
      this.onLedCb('cd', false);
      this.onStatusCb('Error al abrir micrófono. Usa "Mismo PC (Sonido Módem)" o concede permiso.');
      return { ok: false, error: err?.message || 'Micrófono no disponible' };
    }
  }

  async stopListening() {
    this.listening = false;
    if (this.micProcessor) {
      try { this.micProcessor.disconnect(); } catch (_) {}
      this.micProcessor = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (_) {}
      this.micSource = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) track.stop();
      this.micStream = null;
    }
    this.onLedCb('cd', false);
    this.onLedCb('rx', false);
    this.onLedCb('tx', false);
  }
}

export const legacyModem = typeof window !== 'undefined' ? new LegacyModemController() : null;
