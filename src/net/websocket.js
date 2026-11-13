function encodeWsText(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset];
    const b2 = buffer[offset + 1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let payloadLen = b2 & 0x7f;
    let pos = offset + 2;

    if (payloadLen === 126) {
      if (pos + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (payloadLen === 127) {
      if (pos + 8 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(pos));
      pos += 8;
    }

    const maskLen = masked ? 4 : 0;
    if (pos + maskLen + payloadLen > buffer.length) break;

    let payload = buffer.subarray(pos + maskLen, pos + maskLen + payloadLen);
    if (masked) {
      const mask = buffer.subarray(pos, pos + 4);
      const unmasked = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    messages.push({ opcode, payload });
    offset = pos + maskLen + payloadLen;
  }

  return { messages, remaining: buffer.subarray(offset) };
}

module.exports = {
  encodeWsText,
  decodeWsFrames
};
