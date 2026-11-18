import {getDocument} from 'pdfjs-dist';

export function setupDocumentPreview(downloadFile) {
  const element = id => document.getElementById('draft-preview-' + id);
  const dialog = element('dialog');
  const stage = element('stage');
  const previous = element('previous');
  const next = element('next');
  const save = element('save');
  let loadingTask, pdf, file, pageNumber = 1, rendering = false;

  function updateControls() {
    previous.disabled = rendering || !pdf || pageNumber <= 1;
    next.disabled = rendering || !pdf || pageNumber >= pdf.numPages;
    save.disabled = !file;
  }

  async function showPage(number) {
    rendering = true;
    updateControls();
    element('status').textContent = 'ページを表示しています…';
    try {
      const page = await pdf.getPage(number);
      const natural = page.getViewport({scale: 1});
      const available = Math.max(1, Math.min(stage.clientWidth, 820));
      const scale = available / natural.width;
      const drawing = page.getViewport({scale: scale * Math.min(devicePixelRatio || 1, 2)});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(drawing.width);
      canvas.height = Math.ceil(drawing.height);
      canvas.style.width = available + 'px';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `PDFの${number}ページ目`);
      await page.render({canvasContext: canvas.getContext('2d'), viewport: drawing}).promise;
      stage.replaceChildren(canvas);
      stage.scrollTop = 0;
      pageNumber = number;
      element('page').textContent = `${number} / ${pdf.numPages}`;
      element('status').textContent = '';
    } catch {
      element('status').textContent = 'ページを表示できませんでした。';
    } finally {
      rendering = false;
      updateControls();
    }
  }

  previous.onclick = () => showPage(pageNumber - 1);
  next.onclick = () => showPage(pageNumber + 1);
  save.onclick = () => downloadFile(file.blob, file.name);
  element('close').onclick = () => { if (!rendering) dialog.close(); };
  dialog.oncancel = event => { if (rendering) event.preventDefault(); };
  dialog.onclose = () => {
    if (dialog.open) return;
    void loadingTask?.destroy().catch(() => {});
    loadingTask = pdf = file = undefined;
    stage.replaceChildren();
  };

  return async (bytes, name) => {
    // The worker takes ownership of its buffer. Keep the original for downloading.
    void loadingTask?.destroy().catch(() => {});
    pdf = undefined;
    pageNumber = 1;
    file = {blob: new Blob([bytes], {type: 'application/pdf'}), name};
    element('page').textContent = '';
    element('status').textContent = 'プレビューを準備しています…';
    rendering = true;
    updateControls();
    dialog.showModal();
    try {
      loadingTask = getDocument({data: bytes.slice(), isEvalSupported: false});
      pdf = await loadingTask.promise;
      await showPage(1);
    } catch {
      rendering = false;
      updateControls();
      element('status').textContent = 'プレビューを表示できませんでした。PDFはダウンロードできます。';
    }
  };
}
