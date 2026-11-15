import './style.css';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { movePage, exportPdf } from './model.js';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const sources = new Map();
let pages = [], selected = null, history = [], placing = false, busy = false, renderVersion = 0;
const clone = value => structuredClone(value);
let messageTimer;
function message(value, persistent = false) { clearTimeout(messageTimer); $('status').textContent = value; if (!persistent) messageTimer = setTimeout(() => $('status').textContent = '', 5500); }
function remember() { history.push({ pages: clone(pages), selected }); if (history.length > 30) history.shift(); }
function current() { return pages.find(p => p.id === selected); }
function controls() {
  const index = pages.findIndex(p => p.id === selected), page = current();
  $('save').disabled = busy || !pages.length;
  $('files').disabled = busy;
  for (const id of ['rotate','remove','addtext','cleartext']) $(id).disabled = busy || !page;
  $('left').disabled = busy || index <= 0;
  $('right').disabled = busy || index < 0 || index >= pages.length - 1;
  $('cleartext').disabled = busy || !page?.texts.length;
  $('undo').disabled = busy || !history.length;
  $('selected').textContent = page ? `${index + 1} ページ目` : 'ページを選択';
  $('count').textContent = pages.length ? `ページ一覧 · ${pages.length}` : 'ページ一覧';
  $('toolhint').textContent = placing ? 'ページ上をクリックして文字を配置' : pages.length ? 'ドラッグで並べ替え · クリックで選択' : 'PDFを追加して編集をはじめましょう';
  $('drop').hidden = !!pages.length;
  $('pages').classList.toggle('placing', placing);
  $('addtext').textContent = placing ? '配置モードを終了' : '＋ 配置モードにする';
}
async function render() {
  const version = ++renderVersion;
  controls(); $('pages').replaceChildren(); $('sources').replaceChildren();
  for (const [id, source] of sources) {
    const count = pages.filter(p => p.sourceId === id).length;
    if (!count) continue;
    const el = document.createElement('div'); el.className = 'source'; el.textContent = `▤ ${source.name}`;
    const small = document.createElement('small'); small.textContent = `${count} ページ`; el.append(small); $('sources').append(el);
  }
  for (const [index, item] of pages.entries()) {
    if (version !== renderVersion) return;
    const source = sources.get(item.sourceId), pdfPage = await source.pdf.getPage(item.index + 1);
    if (version !== renderVersion) return;
    const viewport = pdfPage.getViewport({scale:1, rotation:item.rotation});
    const card = document.createElement('div'); card.className = `card${selected === item.id ? ' active' : ''}`;
    card.draggable = true; card.tabIndex = 0; card.setAttribute('role','button'); card.setAttribute('aria-label',`${index+1}ページ目を選択`);
    const sheet = document.createElement('div'); sheet.className = 'sheet';
    const canvas = document.createElement('canvas'); sheet.append(canvas);
    const drawing = pdfPage.getViewport({scale:440/viewport.width, rotation:item.rotation});
    canvas.width = Math.ceil(drawing.width); canvas.height = Math.ceil(drawing.height);
    const meta = document.createElement('div'); meta.className = 'card-meta'; meta.textContent = `${String(index+1).padStart(2,'0')}`;
    const name = document.createElement('span'); name.textContent = source.name; meta.append(name); card.append(sheet,meta); $('pages').append(card);
    card.onclick = () => { selected = item.id; document.querySelectorAll('.card').forEach(c => c.classList.remove('active')); card.classList.add('active'); controls(); };
    card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); } };
    card.ondragstart = event => { if (busy) return event.preventDefault(); event.dataTransfer.setData('text/plain',item.id); };
    card.ondragover = event => event.preventDefault();
    card.ondrop = event => { event.preventDefault(); event.stopPropagation(); if (busy) return; const from = pages.findIndex(p => p.id === event.dataTransfer.getData('text/plain')); const to = pages.findIndex(p => p.id === item.id); if (from < 0 || from === to) return; remember(); const [moved] = pages.splice(from,1); pages.splice(to,0,moved); render(); };
    sheet.onclick = event => {
      if (!placing || busy) return;
      event.stopPropagation(); const text = $('text').value.trim(), size = Number($('size').value);
      if (!text || !Number.isFinite(size) || size < 6 || size > 96) return message('テキストと6〜96の文字サイズを入力してください。');
      const rect = sheet.getBoundingClientRect();
      const [x,y] = viewport.convertToPdfPoint((event.clientX-rect.left)/rect.width*viewport.width,(event.clientY-rect.top)/rect.height*viewport.height);
      remember(); item.texts.push({text,x,y,size,color:$('color').value}); selected = item.id; render();
    };
    for (const text of item.texts) {
      const [x,y] = viewport.convertToViewportPoint(text.x,text.y);
      const label = document.createElement('span'); label.className = 'annotation'; label.textContent = text.text;
      label.style.left = `${x/viewport.width*100}%`; label.style.top = `${y/viewport.height*100}%`;
      // Use a container-relative font size so the preview scales with page width.
      sheet.style.containerType = 'inline-size'; label.style.fontSize = `${text.size/viewport.width*100}cqw`; label.style.color = text.color;
      const relativeRotation = ((item.rotation - (text.rotation ?? item.rotation)) + 360) % 360;
      label.style.rotate = `${relativeRotation}deg`; sheet.append(label);
    }
    try { await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:drawing}).promise; }
    catch(error) { if (version === renderVersion) message(`プレビューに失敗しました: ${error.message}`); }
  }
}
async function addFiles(files) {
  if (busy || !files.length) return;
  busy = true; controls(); message('PDFを読み込んでいます…',true);
  let added = 0; const errors = []; const pending = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes);
      const pdf = await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
      const id = crypto.randomUUID(); sources.set(id,{bytes,pdf,name:file.name});
      doc.getPages().forEach((page,index) => pending.push({id:crypto.randomUUID(),sourceId:id,index,rotation:page.getRotation().angle,texts:[]})); added++;
    } catch { errors.push(file.name); }
  }
  if (pending.length) { remember(); pages.push(...pending); selected = pending[0].id; }
  busy = false; $('files').value = ''; await render();
  message(`${added ? `${added} 件のPDFを追加しました。` : ''}${errors.length ? ` 読み込めません: ${errors.join('、')}（破損・暗号化されたPDFには対応していません）` : ''}`);
}
$('files').onchange = event => addFiles([...event.target.files]);
for (const type of ['dragover','drop']) document.addEventListener(type,event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
$('drop').ondragover = event => { event.preventDefault(); $('drop').classList.add('drag'); };
$('drop').ondragleave = () => $('drop').classList.remove('drag');
$('drop').ondrop = event => { event.preventDefault(); $('drop').classList.remove('drag'); addFiles([...event.dataTransfer.files]); };
for (const [id,delta] of [['left',-1],['right',1]]) $(id).onclick = () => { if (busy) return; remember(); pages = movePage(pages,pages.findIndex(p=>p.id===selected),delta); render(); };
$('rotate').onclick = () => { const page=current(); if (!page || busy) return; remember(); for (const t of page.texts) t.rotation ??= page.rotation; page.rotation=(page.rotation+90)%360; render(); };
$('remove').onclick = () => { if (busy) return; remember(); const index=pages.findIndex(p=>p.id===selected); pages.splice(index,1); selected=pages[Math.min(index,pages.length-1)]?.id??null; render(); };
$('undo').onclick = () => { if (busy) return; const previous=history.pop(); if (previous) { pages=previous.pages; selected=previous.selected; render(); } };
$('addtext').onclick = () => { placing=!placing; controls(); if (placing) message('ページ上をクリックしてテキストを配置してください。'); };
$('cleartext').onclick = () => { if (busy || !current()) return; remember(); current().texts=[]; render(); };
$('save').onclick = async () => {
  if (busy || !pages.length) return; busy=true; controls(); message('PDFを書き出しています…',true);
  try {
    let fontBytes;
    if (pages.some(p=>p.texts.length)) { const response=await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.otf`); if (!response.ok) throw new Error('日本語フォントを読み込めません。'); fontBytes=await response.arrayBuffer(); }
    const bytes=await exportPdf(pages,sources,fontBytes); const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const a=document.createElement('a'); a.href=url; a.download='edited-document.pdf'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),60000); message('PDFを書き出しました。');
  } catch(error) { message(`書き出せませんでした: ${error.message}`); }
  finally { busy=false; controls(); }
};
window.addEventListener('beforeunload',event => { if (pages.length) { event.preventDefault(); event.returnValue=''; } });
render();
