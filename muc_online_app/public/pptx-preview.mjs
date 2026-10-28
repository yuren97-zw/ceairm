import { PPTX_LIMITS, safeZipPath, rasterDimensions } from './pptx-zip.mjs?v=20261012-2';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const children = (node, name) => [...node.children].filter(x => x.localName === name);
const descendants = (node, name) => [...node.getElementsByTagNameNS('*', name)];
function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('PPTX含不安全XML声明');
  const parsed = new DOMParser().parseFromString(text, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('PPTX页面XML损坏');
  return parsed;
}
export function resolvePart(base, target) {
  if (!target || /^[\/\\]|[\\:\x00-\x1f?#]/.test(target)) throw new Error('不支持外部或异常资源路径');
  const parts = base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') { if (parts.length <= 1) throw new Error('PPTX资源路径越界'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  const result = safeZipPath(parts.join('/'));
  if (!result.startsWith('ppt/')) throw new Error('PPTX资源路径越界');
  return result;
}
function relationships(text, base) {
  const result = new Map();
  for (const rel of descendants(xml(text), 'Relationship')) {
    const external = rel.getAttribute('TargetMode') === 'External';
    let path = '';
    if (!external) { try { path = resolvePart(base, rel.getAttribute('Target')); } catch {} }
    result.set(rel.getAttribute('Id'), { path, external, type: rel.getAttribute('Type') || '' });
  }
  return result;
}
export function slideOrder(presentation, relText) {
  const relations = relationships(relText, 'ppt/presentation.xml');
  const order = descendants(xml(presentation), 'sldId').map(node => {
    const id = node.getAttributeNS(REL, 'id') || [...node.attributes].find(x => x.localName === 'id' && x.prefix)?.value;
    const rel = relations.get(id);
    if (!rel?.path || rel.external || !rel.type.endsWith('/slide')) throw new Error('PPTX幻灯片关系无效');
    return rel.path;
  });
  if (!order.length) throw new Error('PPTX没有幻灯片');
  if (order.length > PPTX_LIMITS.slides) throw new Error('PPTX超过200页预览限制，请下载原文件');
  return order;
}

class WorkerClient {
  constructor() {
    if (typeof Worker === 'undefined') throw new Error('当前浏览器不支持PPTX预览，请下载原文件');
    this.worker = new Worker(new URL('./pptx-worker.mjs?v=20261012-2', import.meta.url), { type: 'module' });
    this.pending = new Map(); this.id = 0;
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id); if (!pending) return;
      this.pending.delete(data.id);
      data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.value);
    };
    this.worker.onerror = () => this.close('PPTX解析Worker加载失败，请下载原文件');
  }
  call(type, values = {}, transfers = []) {
    if (this.closed) return Promise.reject(new Error('预览已关闭'));
    return new Promise((resolve, reject) => {
      const id = ++this.id; this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...values }, transfers);
    });
  }
  close(message = '预览已关闭') {
    this.closed = true; this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
  }
}

export class PptxPreview {
  constructor() { this.client = new WorkerClient(); this.cache = new Map(); this.urls = new Set(); this.generation = 0; }
  async open(url, signal, size = 0) {
    if (size > PPTX_LIMITS.file) throw new Error('PPTX超过10MiB预览限制，请下载原文件');
    const response = await fetch(url, { signal, credentials: new URL(url, location.href).origin === location.origin ? 'include' : 'omit' });
    if (!response.ok) throw new Error('PPTX读取失败，请重试或下载原文件');
    if (Number(response.headers.get('Content-Length')) > PPTX_LIMITS.file) throw new Error('PPTX超过10MiB预览限制');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('当前浏览器不支持流式PPTX预览，请下载原文件');
    const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length;
        if (total > PPTX_LIMITS.file) throw new Error('PPTX超过10MiB预览限制');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const data = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const initial = await this.client.call('open', { buffer: data.buffer }, [data.buffer]);
    this.order = slideOrder(initial.presentation, initial.relationships);
    this.numPages = this.order.length;
  }
  async text(name) { return new TextDecoder().decode(await this.client.call('read', { name, limit: PPTX_LIMITS.xml })); }
  release(page) { for (const url of page.urls) { URL.revokeObjectURL(url); this.urls.delete(url); } }
  close() {
    this.closed = true; this.generation++; this.client.close();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear(); this.cache.clear();
  }
  async page(number) {
    if (this.closed) throw new Error('预览已关闭');
    const generation = ++this.generation;
    const cached = this.cache.get(number);
    if (cached) { this.cache.delete(number); this.cache.set(number, cached); return cached.element; }
    const path = this.order[number - 1];
    const doc = xml(await this.text(path));
    const relPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
    let relations;
    try { relations = relationships(await this.text(relPath), path); }
    catch (error) { if (!error.message.startsWith('PPTX缺少文件')) throw error; relations = new Map(); }
    const element = document.createElement('article'); element.className = 'pptx-slide';
    element.setAttribute('aria-label', `第${number}页幻灯片`);
    const notice = document.createElement('p'); notice.className = 'pptx-notice';
    notice.textContent = '简化预览，排版及部分元素可能不完整，请下载原文件查看。'; element.append(notice);
    if (['0', 'false'].includes(doc.documentElement.getAttribute('show'))) {
      const label = document.createElement('p'); label.className = 'pptx-notice'; label.textContent = '隐藏页'; element.append(label);
    }
    const warnings = new Set(), page = { element, urls: [] };
    let blocks = 0, imageCount = 0, textSize = 0, imagePixels = 0;
    const addText = (target, text) => {
      textSize += text.length;
      if (textSize > 200000 || ++blocks > 4000) throw new Error('本页文字或结构过多，无法简化预览，请下载原文件');
      target.textContent = text;
    };
    const paragraph = node => descendants(node, 'p').map(p => descendants(p, 't').map(t => t.textContent).join('')).filter(Boolean);
    const walk = async tree => {
      for (const shape of tree.children) {
        if (this.closed || generation !== this.generation) throw new Error('预览页面已切换');
        if (shape.localName === 'grpSp') await walk(shape);
        else if (shape.localName === 'sp') {
          for (const text of paragraph(shape)) { const p = document.createElement('p'); addText(p, text); element.append(p); }
          if (descendants(shape, 'prstGeom').length && !paragraph(shape).length) warnings.add('图形');
        } else if (shape.localName === 'pic') {
          if (++imageCount > 40) throw new Error('本页图片过多，请下载原文件');
          const blip = descendants(shape, 'blip')[0];
          const relation = relations.get(blip?.getAttributeNS(REL, 'embed') || blip?.getAttributeNS(REL, 'link'));
          const ext = relation?.path?.split('.').pop()?.toLowerCase();
          const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext];
          if (!relation?.path || relation.external || !mime || !relation.type.endsWith('/image')) { warnings.add('外部或不支持的图片'); continue; }
          const buffer = await this.client.call('read', { name: relation.path, limit: 10 * 1024 ** 2 });
          if (this.closed || generation !== this.generation) throw new Error('预览页面已切换');
          const dimensions = rasterDimensions(buffer, ext);
          const pixels = dimensions && dimensions[0] * dimensions[1];
          if (!pixels || dimensions.some(x => x <= 0) || imagePixels + pixels > 8000000) { warnings.add('过大或无法安全解析的图片'); continue; }
          imagePixels += pixels;
          const url = URL.createObjectURL(new Blob([buffer], { type: mime })); this.urls.add(url); page.urls.push(url);
          const img = document.createElement('img'); img.src = url; img.alt = '幻灯片内嵌图片'; img.loading = 'lazy'; img.decoding = 'async'; element.append(img);
        } else if (shape.localName === 'graphicFrame') {
          const tableNode = descendants(shape, 'tbl')[0];
          if (!tableNode) { warnings.add('图表或SmartArt'); continue; }
          const wrap = document.createElement('div'); wrap.className = 'pptx-table'; const table = document.createElement('table');
          for (const row of children(tableNode, 'tr')) {
            const tr = document.createElement('tr');
            for (const cell of children(row, 'tc')) { const td = document.createElement('td'); addText(td, paragraph(cell).join('\n')); tr.append(td); }
            table.append(tr);
          }
          wrap.append(table); element.append(wrap);
        } else if (!['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(shape.localName)) warnings.add('其他图形或嵌入对象');
      }
    };
    try {
      const tree = descendants(doc, 'spTree')[0];
      if (tree) await walk(tree);
      if (descendants(doc, 'timing').length || descendants(doc, 'transition').length) warnings.add('动画或切换效果');
      if (descendants(doc, 'oMath').length || descendants(doc, 'oMathPara').length) warnings.add('公式');
      if (descendants(doc, 'videoFile').length || descendants(doc, 'audioFile').length || descendants(doc, 'media').length) warnings.add('音视频');
      if ([...relations.values()].some(rel => rel.external)) warnings.add('外部链接或资源');
      if (warnings.size) { const p = document.createElement('p'); p.className = 'pptx-notice'; p.textContent = `本页包含未完整预览的内容：${[...warnings].join('、')}。`; element.append(p); }
      if (element.children.length === 1 || element.children.length === 2 && element.children[1].textContent === '隐藏页') { const p = document.createElement('p'); p.textContent = '本页为空白页或没有可提取的文字、图片。'; element.append(p); }
      if (this.closed || generation !== this.generation) throw new Error('预览页面已切换');
      this.cache.set(number, page);
      while (this.cache.size > 3) { const oldest = this.cache.keys().next().value; this.release(this.cache.get(oldest)); this.cache.delete(oldest); }
      return element;
    } catch (error) { this.release(page); throw error; }
  }
}
