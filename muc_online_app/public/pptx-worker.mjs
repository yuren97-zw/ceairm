import { PptxZip, PPTX_LIMITS } from './pptx-zip.mjs?v=20261012-2';
let zip;
self.onmessage = async ({ data }) => {
  const { id, type, buffer, name, limit } = data;
  try {
    if (type === 'open') {
      zip = new PptxZip(buffer);
      self.postMessage({ id, value: { presentation: new TextDecoder().decode(await zip.read('ppt/presentation.xml', PPTX_LIMITS.xml)), relationships: new TextDecoder().decode(await zip.read('ppt/_rels/presentation.xml.rels', PPTX_LIMITS.xml)) } });
    } else if (type === 'read') {
      const bytes = await zip.read(name, limit);
      self.postMessage({ id, value: bytes.buffer }, [bytes.buffer]);
    } else throw new Error('无效PPTX请求');
  } catch (error) { self.postMessage({ id, error: error.message || 'PPTX解析失败' }); }
};
