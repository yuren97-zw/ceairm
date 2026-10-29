function attachmentExt(name){return (String(name||" ").toLowerCase().match(/\.([a-z0-9]+)$/)||["",""])[1];}
function uploadHttpError(status,message){return Object.assign(new Error(message),{status});}
const ATTACHMENT_MIME_BY_EXT = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  log: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/mp4",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac"
};

const INLINE_SAFE_ATTACHMENT_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf", "txt", "csv", "log", "md", "mp4", "mov", "m4v", "webm", "avi", "mp3", "wav", "m4a", "aac"]);

const ATTACHMENT_MAGIC_CHECKS = {
  pdf: head => head.subarray(0, 5).toString("latin1") === "%PDF-",
  png: head => head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: head => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  jpeg: head => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  gif: head => head.subarray(0, 3).toString("latin1") === "GIF",
  webp: head => head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP",
  bmp: head => head[0] === 0x42 && head[1] === 0x4d,
  pptx: head => head.subarray(0, 4).toString("latin1") === "PK\u0003\u0004",
  xlsx: head => head.subarray(0, 4).toString("latin1") === "PK\u0003\u0004",
  docx: head => head.subarray(0, 4).toString("latin1") === "PK\u0003\u0004",
  xls: head => head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  doc: head => head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  mp4: head => head.subarray(4, 8).toString("latin1") === "ftyp",
  m4v: head => head.subarray(4, 8).toString("latin1") === "ftyp",
  m4a: head => head.subarray(4, 8).toString("latin1") === "ftyp",
  mov: head => head.subarray(4, 8).toString("latin1") === "ftyp",
  webm: head => head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3,
  avi: head => head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "AVI ",
  mp3: head => head.subarray(0, 3).toString("latin1") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0),
  wav: head => head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WAVE"
};

export function safeAttachmentMime(name) {
  return ATTACHMENT_MIME_BY_EXT[attachmentExt(name)] || "application/octet-stream";
}

export function validateUploadContent(name, head) {
  const ext = attachmentExt(name);
  const check = ATTACHMENT_MAGIC_CHECKS[ext];
  if (check && !check(head)) {
    throw uploadHttpError(415, "文件内容与扩展名不符，已拒绝上传");
  }
}

export const isInlineSafeName=name=>INLINE_SAFE_ATTACHMENT_EXTS.has(attachmentExt(name));
