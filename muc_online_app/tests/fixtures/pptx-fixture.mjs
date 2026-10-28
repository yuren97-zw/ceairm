import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../public/pptx-zip.mjs';
export function zipFixture(entries, { compressed = false } = {}) {
  const parts = [], directory = []; let offset = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = Buffer.from(path), bytes = Buffer.from(value), raw = compressed ? deflateRawSync(bytes) : bytes;
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc32(bytes), 14); local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(compressed ? 8 : 0, 10);
    central.writeUInt32LE(crc32(bytes), 16); central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, name, raw); directory.push(central, name); offset += local.length + name.length + raw.length;
  }
  const cd = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8); end.writeUInt16LE(directory.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const pptxEntries = {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  'ppt/presentation.xml': `<p:presentation ${ns}><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': `<Relationships><Relationship Id="rId9" Type="${relType}slide" Target="slides/slide9.xml"/><Relationship Id="rId2" Type="${relType}slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="${relType}slide" Target="slides/slide3.xml"/></Relationships>`,
  'ppt/slides/slide9.xml': `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>PPTX简化预览测试</a:t></a:r></a:p><a:p><a:r><a:t>文字内容安全展示，不执行脚本。</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>地点</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>人员</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>青岛</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>测试人员</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide9.xml.rels': `<Relationships><Relationship Id="rId1" Type="${relType}image" Target="../media/image1.png"/></Relationships>`,
  'ppt/media/image1.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZioAAAAASUVORK5CYII=', 'base64'),
  'ppt/slides/slide2.xml': `<p:sld ${ns} show="0"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>隐藏页按定义顺序显示</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame><p:pic><p:blipFill><a:blip r:link="external"/></p:blipFill></p:pic></p:spTree></p:cSld><p:timing/></p:sld>`,
  'ppt/slides/_rels/slide2.xml.rels': `<Relationships><Relationship Id="external" Type="${relType}image" Target="https://example.invalid/private-image.png" TargetMode="External"/></Relationships>`,
  'ppt/slides/slide3.xml': `<p:sld ${ns}><p:cSld><p:spTree/></p:cSld></p:sld>`,
  'ppt/notesSlides/notesSlide1.xml': '<secret>演讲者备注不应显示</secret>'
};
export const pptxFixture = () => zipFixture(pptxEntries, { compressed: true });
