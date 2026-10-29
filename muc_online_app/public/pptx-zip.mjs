export const PPTX_LIMITS = { file: 10 * 1024 ** 2, entries: 5000, expanded: 100 * 1024 ** 2, slides: 200, xml: 2 * 1024 ** 2 };
export function safeZipPath(name) {
  if (!name || name.startsWith('/') || /[\\\x00-\x1f:]/.test(name) || name.split('/').some(x => x === '..' || x === '.')) throw new Error('PPTX包含异常路径');
  return name;
}
export function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
// Read raster dimensions before browser decoding to avoid compressed-image memory bombs.
export function rasterDimensions(buffer, ext) {
  const b = new Uint8Array(buffer), v = new DataView(buffer);
  if (ext === 'png' && b.length >= 24 && v.getUint32(0) === 0x89504e47) return [v.getUint32(16), v.getUint32(20)];
  if (ext === 'gif' && b.length >= 10 && b[0] === 71 && b[1] === 73 && b[2] === 70) return [v.getUint16(6, true), v.getUint16(8, true)];
  if (ext === 'bmp' && b.length >= 26 && b[0] === 66 && b[1] === 77) return [v.getInt32(18, true), Math.abs(v.getInt32(22, true))];
  if (['jpg', 'jpeg'].includes(ext) && b.length >= 4 && b[0] === 255 && b[1] === 216) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i++] !== 255) return null;
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (i + 2 > b.length) return null;
      const size = v.getUint16(i);
      if (size < 2 || i + size > b.length) return null;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker) && size >= 8) return [v.getUint16(i + 5), v.getUint16(i + 3)];
      i += size;
    }
  }
  if (ext === 'webp' && b.length >= 25 && v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) {
    const type = v.getUint32(12);
    if (type === 0x56503858 && b.length >= 30) return [1 + b[24] + (b[25] << 8) + (b[26] << 16), 1 + b[27] + (b[28] << 8) + (b[29] << 16)];
    if (type === 0x5650384c && b[20] === 47) return [1 + ((b[21] | b[22] << 8) & 16383), 1 + ((b[22] >> 6 | b[23] << 2 | b[24] << 10) & 16383)];
    if (type === 0x56503820 && b.length >= 30 && b[23] === 157 && b[24] === 1 && b[25] === 42) return [v.getUint16(26, true) & 16383, v.getUint16(28, true) & 16383];
  }
  return null;
}

export class PptxZip {
  constructor(buffer) {
    if (buffer.byteLength > PPTX_LIMITS.file) throw new Error('PPTX超过10MiB预览限制，请下载原文件');
    this.bytes = new Uint8Array(buffer); this.view = new DataView(buffer); this.entries = new Map(); this.actual = 0; this.seen = new Set();
    const n = buffer.byteLength;
    if (n >= 8 && this.view.getUint32(0, true) === 0xe011cfd0) throw new Error('加密或旧格式PPTX不支持预览，请下载原文件');
    let end = -1;
    for (let i = n - 22; i >= Math.max(0, n - 65557); i--) {
      if (this.view.getUint32(i, true) === 0x06054b50 && i + 22 + this.view.getUint16(i + 20, true) === n) { end = i; break; }
    }
    if (end < 0) throw new Error('PPTX损坏，未找到ZIP目录');
    const count = this.view.getUint16(end + 10, true), directory = this.view.getUint32(end + 16, true), length = this.view.getUint32(end + 12, true);
    if (this.view.getUint16(end + 4, true) || this.view.getUint16(end + 6, true) || this.view.getUint16(end + 8, true) !== count || count === 65535) throw new Error('不支持分卷或ZIP64文件');
    if (count > PPTX_LIMITS.entries) throw new Error('PPTX超过5000个ZIP条目预览限制');
    if (directory + length !== end) throw new Error('PPTX目录边界无效');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let offset = directory, declared = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || this.view.getUint32(offset, true) !== 0x02014b50) throw new Error('PPTX目录损坏');
      const flags = this.view.getUint16(offset + 8, true), method = this.view.getUint16(offset + 10, true);
      const compressed = this.view.getUint32(offset + 20, true), size = this.view.getUint32(offset + 24, true);
      const nameLength = this.view.getUint16(offset + 28, true), extra = this.view.getUint16(offset + 30, true), comment = this.view.getUint16(offset + 32, true);
      const local = this.view.getUint32(offset + 42, true);
      if (flags & 1 || flags & 64) throw new Error('加密PPTX不支持预览');
      if (![0, 8].includes(method)) throw new Error('PPTX压缩方式不受支持');
      if (offset + 46 + nameLength + extra + comment > end || local + 30 > directory) throw new Error('PPTX条目边界无效');
      const name = safeZipPath(decoder.decode(this.bytes.subarray(offset + 46, offset + 46 + nameLength)));
      if (this.entries.has(name)) throw new Error('PPTX包含重复路径');
      if (this.view.getUint32(local, true) !== 0x04034b50 || this.view.getUint16(local + 8, true) !== method || this.view.getUint16(local + 6, true) !== flags) throw new Error('PPTX本地条目无效');
      const localNameLength = this.view.getUint16(local + 26, true), localExtra = this.view.getUint16(local + 28, true);
      const start = local + 30 + localNameLength + localExtra;
      if (start + compressed > directory || decoder.decode(this.bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error('PPTX内容边界无效');
      declared += size;
      if (declared > PPTX_LIMITS.expanded) throw new Error('PPTX声明解压量超过100MiB预览限制');
      this.entries.set(name, { start, compressed, size, method, crc: this.view.getUint32(offset + 16, true) });
      offset += 46 + nameLength + extra + comment;
    }
    if (offset !== end) throw new Error('PPTX目录长度无效');
    if (!this.entries.has('ppt/presentation.xml') || !this.entries.has('ppt/_rels/presentation.xml.rels')) throw new Error('未找到有效的PPTX演示文稿');
  }

  async read(name, limit = PPTX_LIMITS.expanded) {
    const entry = this.entries.get(safeZipPath(name));
    if (!entry) throw new Error(`PPTX缺少文件：${name}`);
    if (entry.size > limit) throw new Error('PPTX页面内容超过预览限制');
    const raw = this.bytes.subarray(entry.start, entry.start + entry.compressed);
    let data;
    if (entry.method === 0) data = raw.slice();
    else {
      if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持PPTX解压，请下载原文件');
      const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length;
          if (length > entry.size || length > limit || this.actual + length > PPTX_LIMITS.expanded) throw new Error('PPTX实际解压量超过限制');
          chunks.push(value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      data = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    }
    if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error('PPTX条目大小或校验失败');
    if (!this.seen.has(name)) { this.actual += data.length; this.seen.add(name); }
    if (this.actual > PPTX_LIMITS.expanded) throw new Error('PPTX实际解压量超过100MiB');
    return data;
  }
}
