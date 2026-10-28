const PDF_ROOT = '/vendor/pdfjs/6.4.299/';
export const boundedZoom = value => Math.min(3, Math.max(.5, Number(value) || 1));
export const canvasDensity = (width, height, dpr = 1) => Math.min(dpr, 2, Math.sqrt(4000000 / Math.max(1, width * height)));

export class AttachmentViewer {
  constructor({ source, preview, download, escape }) {
    Object.assign(this, { source, preview, download, escape });
    this.dialog = document.querySelector('#viewerDialog');
    this.content = document.querySelector('#viewerContent');
    this.serial = 0;
    this.pointers = new Map();
    this.dialog.addEventListener('close', () => this.close());
    this.dialog.addEventListener('click', event => {
      const action = event.target.closest('[data-viewer-action]')?.dataset.viewerAction;
      if (action === 'out') this.changeZoom(-.1);
      if (action === 'in') this.changeZoom(.1);
      if (action === 'reset') { this.zoom = 1; this.fit = ''; this.redraw(); }
      if (action === 'fit') { this.fit = 'width'; this.redraw(); }
      if (action === 'prev') this.turn(-1);
      if (action === 'next') this.turn(1);
      if (action === 'retry') this.open(this.file);
    });
    this.content.addEventListener('pointerdown', event => this.pointerDown(event));
    this.content.addEventListener('pointermove', event => this.pointerMove(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.content.addEventListener(type, event => { this.pointers.delete(event.pointerId); this.gesture = null; });
    }
    this.resize = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => { if (this.dialog.open && this.fit) this.redraw(); }, 100);
    });
    this.resize.observe(this.content);
  }

  close() {
    this.serial++;
    this.renderSerial = (this.renderSerial || 0) + 1;
    this.renderTask?.cancel();
    this.abort?.abort();
    this.pptx?.close(); this.pptx = null;
    if (this.pendingImage) this.pendingImage.src = '';
    this.pendingImage = null;
    this.task?.destroy().catch(() => {});
    this.task = null; this.pdf = null; this.image = null; this.pageObject = null;
    clearTimeout(this.resizeTimer);
    cancelAnimationFrame(this.frame);
    this.pointers.clear(); this.gesture = null;
    this.content.replaceChildren();
    this.content.classList.remove('viewer-interactive');
    if (this.scrollLock) {
      document.body.style.overflow = this.scrollLock;
      this.scrollLock = null;
    } else if (this.scrollLock === '') {
      document.body.style.overflow = ''; this.scrollLock = null;
    }
  }

  async open(file) {
    if (!file) return;
    this.close();
    this.file = file; this.page = 1; this.zoom = 1; this.fit = 'width';
    const signal = (this.abort = new AbortController()).signal;
    this.kind = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? 'pdf' :
      /\.pptx$/i.test(file.name) ? 'pptx' : /^image\//i.test(file.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name) ? 'image' : 'other';
    const token = this.serial;
    const title = document.querySelector('#viewerTitle');
    title.textContent = file.name || '附件'; title.title = title.textContent;
    this.scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.setTools();
    const link = document.querySelector('#viewerDownload');
    link.href = this.download(file); link.download = file.name || '附件'; link.hidden = !link.getAttribute('href');
    this.content.innerHTML = '<p class="viewer-message" role="status">正在加载附件…</p>';
    if (!this.dialog.open) this.dialog.showModal();
    try {
      // Resolve fresh authorization on every open and retry; never reuse expired COS URLs.
      let url = await this.source(file, signal);
      if (token !== this.serial) return;
      if (!url) throw new Error('未找到附件内容');
      if (this.kind === 'pdf') {
        const pdfjs = await import(`${PDF_ROOT}pdf.mjs`);
        if (token !== this.serial) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_ROOT}pdf.worker.mjs`;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (token !== this.serial) return;
          const task = this.task = pdfjs.getDocument({ url, withCredentials: new URL(url, location.href).origin === location.origin,
            cMapUrl: `${PDF_ROOT}cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDF_ROOT}standard_fonts/`,
            wasmUrl: `${PDF_ROOT}wasm/`, isEvalSupported: false, enableXfa: false,
            disableAutoFetch: true, disableStream: true });
          try { const pdf = await task.promise; if (token !== this.serial) return; this.pdf = pdf; break; }
          catch (error) {
            if (token !== this.serial) return;
            if (attempt || ['PasswordException', 'InvalidPDFException'].includes(error.name)) throw error;
            await task.destroy().catch(() => {});
            url = await this.source(file, signal);
          }
        }
        if (token !== this.serial) return;
        this.content.replaceChildren(); this.setTools(); await this.drawPdf();
      } else if (this.kind === 'pptx') {
        const { PptxPreview } = await import('./pptx-preview.mjs?v=20261012-2');
        if (token !== this.serial) return;
        const pptx = this.pptx = new PptxPreview();
        await pptx.open(url, signal, Number(file.size || 0));
        if (token !== this.serial) return;
        this.setTools(); await this.drawPptx();
      } else if (this.kind === 'image') {
        const image = this.pendingImage = new Image();
        image.alt = file.name || '附件';
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('图片加载失败，请重试')); image.src = url; });
        if (token !== this.serial) return;
        this.pendingImage = null; this.image = image; this.fit = 'contain';
        this.content.replaceChildren(); await this.redraw();
      } else {
        const html = await this.preview(file, url, signal);
        if (token !== this.serial) return;
        this.content.innerHTML = `<div class="viewer-simple">${html}</div>`;
        this.fit = ''; this.zoom = 1; this.setTools();
      }
    } catch (error) {
      if (token === this.serial) this.fail(error);
    }
  }

  fail(error) {
    this.abort?.abort();
    this.pptx?.close(); this.pptx = null;
    const message = error.name === 'PasswordException' ? '此PDF需要密码，当前不支持解锁，请下载原文件查看。' :
      error.name === 'InvalidPDFException' ? 'PDF损坏或格式不受支持，请下载原文件查看。' : `预览失败：${error.message || '请重试或下载原文件'}`;
    this.content.classList.remove('viewer-interactive');
    document.querySelector('#viewerZoomTools').hidden = true;
    document.querySelector('#viewerPageTools').hidden = true;
    this.content.innerHTML = `<div class="viewer-message" role="alert">${this.escape(message)} <button type="button" data-viewer-action="retry">重试</button></div>`;
  }

  setTools() {
    const zoomable = ['pdf', 'image'].includes(this.kind) || !/\.(mp4|mov|m4v|webm|mp3|wav|m4a|aac)$/i.test(this.file?.name || '');
    document.querySelector('#viewerZoomTools').hidden = !zoomable;
    const paged = this.pdf || this.pptx;
    document.querySelector('#viewerPageTools').hidden = !['pdf', 'pptx'].includes(this.kind);
    document.querySelector('#viewerFit').hidden = !['pdf', 'image', 'pptx'].includes(this.kind);
    document.querySelector('#viewerZoomReset').textContent = `${Math.round(this.zoom * 100)}%`;
    document.querySelector('#viewerZoomOut').disabled = this.zoom <= .5;
    document.querySelector('#viewerZoomIn').disabled = this.zoom >= 3;
    document.querySelector('#viewerPageLabel').textContent = `${this.page} / ${paged?.numPages || '…'}`;
    document.querySelector('#viewerPrevious').disabled = !paged || this.page <= 1;
    document.querySelector('#viewerNext').disabled = !paged || this.page >= paged.numPages;
    this.content.classList.toggle('viewer-interactive', ['pdf', 'image'].includes(this.kind));
  }

  async drawPdf() {
    if (!this.pdf) return;
    const token = this.serial;
    const renderId = this.renderSerial = (this.renderSerial || 0) + 1;
    this.renderTask?.cancel();
    const pdf = this.pdf;
    try {
      const page = await pdf.getPage(this.page);
      if (token !== this.serial || renderId !== this.renderSerial) return;
      const original = page.getViewport({ scale: 1 });
      if (this.fit) this.zoom = Math.max(.1, Math.min(3, (this.content.clientWidth - 20) / original.width));
      const viewport = page.getViewport({ scale: this.zoom });
      const canvas = document.createElement('canvas');
      const density = canvasDensity(viewport.width, viewport.height, window.devicePixelRatio || 1);
      canvas.width = Math.ceil(viewport.width * density); canvas.height = Math.ceil(viewport.height * density);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${this.file.name} 第${this.page}页`);
      this.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [density, 0, 0, density, 0, 0] });
      await this.renderTask.promise;
      if (token !== this.serial || renderId !== this.renderSerial) { canvas.width = 0; return; }
      const old = this.pageObject;
      this.pageObject = page;
      const stage = document.createElement('div'); stage.className = 'viewer-stage viewer-pdf-stage'; stage.append(canvas);
      for (const previous of this.content.querySelectorAll('canvas')) previous.width = 0;
      this.content.replaceChildren(stage);
      if (old && old !== page) old.cleanup();
      this.setTools();
    } catch (error) {
      if (token === this.serial && renderId === this.renderSerial && error.name !== 'RenderingCancelledException') this.fail(error);
    }
  }

  async drawPptx() {
    if (!this.pptx) return;
    const token = this.serial, renderId = this.renderSerial = (this.renderSerial || 0) + 1;
    try {
      const slide = await this.pptx.page(this.page);
      if (token !== this.serial || renderId !== this.renderSerial) return;
      if (this.fit) { this.pptxWidth = Math.max(200, Math.min(900, this.content.clientWidth - 20)); this.zoom = 1; }
      slide.style.width = `${this.pptxWidth || 900}px`;
      slide.style.zoom = String(this.zoom);
      const stage = document.createElement('div'); stage.className = 'pptx-stage'; stage.append(slide);
      this.content.replaceChildren(stage); this.setTools();
    } catch (error) { if (token === this.serial && renderId === this.renderSerial) this.fail(error); }
  }

  async redraw() {
    if (this.kind === 'pptx') return this.drawPptx();
    if (this.kind === 'pdf') return this.drawPdf();
    if (this.image) {
      if (this.fit) {
        const widthRatio = (this.content.clientWidth - 20) / this.image.naturalWidth;
        this.zoom = this.fit === 'contain' ? Math.min(1, widthRatio, (this.content.clientHeight - 20) / this.image.naturalHeight) : Math.min(3, widthRatio);
        this.zoom = Math.max(.01, this.zoom);
      }
      const stage = document.createElement('div'); stage.className = 'viewer-stage';
      this.image.style.width = `${this.image.naturalWidth * this.zoom}px`;
      this.image.style.height = `${this.image.naturalHeight * this.zoom}px`;
      this.image.draggable = false; stage.append(this.image); this.content.replaceChildren(stage);
    } else {
      const simple = this.content.querySelector('.viewer-simple');
      if (simple) simple.style.zoom = String(this.zoom);
    }
    this.setTools();
  }

  changeZoom(delta) {
    if (delta < 0 && this.zoom <= .5 || delta > 0 && this.zoom >= 3) return;
    this.fit = ''; this.zoom = boundedZoom(this.zoom + delta); this.redraw();
  }
  turn(delta) {
    const paged = this.pdf || this.pptx;
    if (!paged) return;
    this.page = Math.max(1, Math.min(paged.numPages, this.page + delta));
    this.content.scrollTo(0, 0); this.setTools(); this.redraw();
  }
  pointerDown(event) {
    if (!['pdf', 'image'].includes(this.kind) || event.target.closest('button,a')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.content.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.gesture = null;
  }
  pointerMove(event) {
    const last = this.pointers.get(event.pointerId);
    if (!last) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) {
      this.content.scrollLeft -= event.clientX - last.x;
      this.content.scrollTop -= event.clientY - last.y;
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (!this.gesture) this.gesture = { distance, zoom: this.zoom };
      const prior = this.zoom;
      this.fit = ''; this.zoom = boundedZoom(this.gesture.zoom * distance / Math.max(1, this.gesture.distance));
      const rect = this.content.getBoundingClientRect();
      const x = (a.x + b.x) / 2 - rect.left, y = (a.y + b.y) / 2 - rect.top;
      const left = (this.content.scrollLeft + x) * this.zoom / prior - x;
      const top = (this.content.scrollTop + y) * this.zoom / prior - y;
      // Schedule at most one render per frame; PDF render cancellation prevents stale canvases.
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(async () => { await this.redraw(); if (this.dialog.open) this.content.scrollTo(left, top); });
    }
  }
}
