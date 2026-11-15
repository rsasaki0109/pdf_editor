import './style.css';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { movePage, exportPdf, duplicatePages } from './model.js';
import { outputFilename } from './filename.js';
import { parsePageRange } from './page-range.js';
import { saveProject, readProject, MAX_PROJECT_BYTES } from './project.js';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
const sources = new Map();
let pages = [], selected = null, history = [], future = [], placing = false, busy = false, renderVersion = 0, selectedText = null, movingText = false, checkedPages = new Set();
const clone = value => structuredClone(value);
let messageTimer;
function message(value, persistent = false) { clearTimeout(messageTimer); $('status').textContent = value; $('preview-status').textContent = $('preview').open ? value : ''; if (!persistent) messageTimer = setTimeout(() => { $('status').textContent = ''; $('preview-status').textContent = ''; }, 5500); }
function snapshot() { return { pages: clone(pages), selected, selectedText, checkedPages: [...checkedPages] }; }
function remember() { history.push(snapshot()); if (history.length > 30) history.shift(); future = []; }
function current() { return pages.find(p => p.id === selected); }
function controls(refreshPreview = true) {
  const index = pages.findIndex(p => p.id === selected), page = current();
  if (!page?.texts.some(t => t.id === selectedText)) { selectedText = null; if (movingText) placing = false; movingText = false; }
  for (const prefix of ['', 'preview-']) {
    for (const id of ['update-text','move-text','delete-text']) $(prefix+id).disabled = busy || !selectedText;
  }
  const pageIds=new Set(pages.map(p=>p.id));
  checkedPages=new Set([...checkedPages].filter(id=>pageIds.has(id)));
  $('bulk-tools').hidden=!pages.length;
  $('bulk-count').textContent=`${checkedPages.size}ページ選択`;
  $('select-all').disabled=busy || !pages.length;
  $('page-range').disabled=busy || !pages.length;
  $('range-apply').disabled=busy || !pages.length;
  $('range-hint').textContent=`現在の一覧の1〜${pages.length}ページを指定`;
  $('select-all').checked=pages.length>0 && checkedPages.size===pages.length;
  $('select-all').indeterminate=checkedPages.size>0 && checkedPages.size<pages.length;
  for (const id of ['bulk-clear','bulk-rotate','bulk-delete','bulk-export','bulk-duplicate']) $(id).disabled=busy || !checkedPages.size;
  document.querySelectorAll('.page-check').forEach(input=>{input.disabled=busy;input.checked=checkedPages.has(input.value);input.closest('.card').classList.toggle('checked-card',input.checked);});
  $('save').disabled = busy || !pages.length;
  $('output-name').disabled=busy;
  $('files').disabled = busy;
  $('add-blank').disabled = busy;
  $('save-project').disabled = busy || !pages.length;
  $('open-project').disabled = busy;
  $('project-file').disabled = busy;
  for (const id of ['rotate','remove','addtext','cleartext','expand','duplicate']) $(id).disabled = busy || !page;
  $('left').disabled = busy || index <= 0;
  $('right').disabled = busy || index < 0 || index >= pages.length - 1;
  $('cleartext').disabled = busy || !page?.texts.length;
  $('undo').disabled = busy || !history.length;
  $('redo').disabled = busy || !future.length;
  $('selected').textContent = page ? `${index + 1} ページ目` : 'ページを選択';
  $('count').textContent = pages.length ? `ページ一覧 · ${pages.length}` : 'ページ一覧';
  $('toolhint').textContent = movingText ? 'ページ上をクリックして選択した文字を移動' : placing ? 'ページ上をクリックして文字を配置' : pages.length ? 'ドラッグで並べ替え · クリックで選択' : 'PDFを追加して編集をはじめましょう';
  $('drop').hidden = !!pages.length;
  $('pages').classList.toggle('placing', placing);
  $('addtext').textContent = placing ? '配置モードを終了' : '＋ 配置モードにする';
  if (refreshPreview && $('preview').open) renderPreview();
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
    card.classList.toggle('checked-card',checkedPages.has(item.id));
    card.draggable = true; card.tabIndex = 0; card.setAttribute('role','button'); card.setAttribute('aria-label',`${index+1}ページ目を選択`);
    const sheet = document.createElement('div'); sheet.className = 'sheet';
    const canvas = document.createElement('canvas'); sheet.append(canvas);
    const drawing = pdfPage.getViewport({scale:440/viewport.width, rotation:item.rotation});
    canvas.width = Math.ceil(drawing.width); canvas.height = Math.ceil(drawing.height);
    const meta = document.createElement('div'); meta.className = 'card-meta'; meta.textContent = `${String(index+1).padStart(2,'0')}`;
    const name = document.createElement('span'); name.textContent = source.name; meta.append(name); card.append(sheet,meta);
    const checkLabel=document.createElement('label');checkLabel.className='page-check-label';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='page-check';checkbox.value=item.id;checkbox.checked=checkedPages.has(item.id);checkbox.disabled=busy;
    checkbox.setAttribute('aria-label',`${index+1}ページ目をまとめて操作する対象に選択`);
    checkLabel.append(checkbox);card.prepend(checkLabel);checkLabel.onclick=event=>event.stopPropagation();
    checkbox.onchange=()=>{if (busy) return; if (checkbox.checked) checkedPages.add(item.id); else checkedPages.delete(item.id); controls(false);};
    checkLabel.ondragstart=event=>event.preventDefault();
    $('pages').append(card);
    card.onclick = () => { if (busy) return; selected = item.id; document.querySelectorAll('.card').forEach(c => c.classList.remove('active')); card.classList.add('active'); controls(); };
    card.onkeydown = event => { if (event.target !== card) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); } };
    card.ondragstart = event => { if (busy) return event.preventDefault(); event.dataTransfer.setData('text/plain',item.id); };
    card.ondragover = event => event.preventDefault();
    card.ondrop = event => { event.preventDefault(); event.stopPropagation(); if (busy) return; const from = pages.findIndex(p => p.id === event.dataTransfer.getData('text/plain')); const to = pages.findIndex(p => p.id === item.id); if (from < 0 || from === to) return; remember(); const [moved] = pages.splice(from,1); pages.splice(to,0,moved); render(); };
    sheet.onclick = event => {
      if (!placing || busy) return;
      event.stopPropagation(); placeText(event, sheet, viewport, item);
    };
    addAnnotations(sheet, viewport, item);
    try { await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:drawing}).promise; }
    catch(error) { if (version === renderVersion) message(`プレビューに失敗しました: ${error.message}`); }
  }
}

function addAnnotations(sheet, viewport, item) {
  sheet.style.containerType = 'inline-size';
  for (const text of item.texts) {
    const [x,y] = viewport.convertToViewportPoint(text.x,text.y);
    const label = document.createElement('span'); label.className = 'annotation'; label.textContent = text.text;
    label.style.left = `${x/viewport.width*100}%`; label.style.top = `${y/viewport.height*100}%`;
    label.style.fontSize = `${text.size/viewport.width*100}cqw`; label.style.color = text.color;
    label.style.rotate = `${((item.rotation - (text.rotation ?? item.rotation)) + 360) % 360}deg`;
    label.classList.toggle('selected-annotation', item.id === selected && text.id === selectedText);
    label.tabIndex = 0; label.setAttribute('role','button'); label.setAttribute('aria-label',`追加テキストを編集: ${text.text}`); label.dataset.textId = text.id;
    label.onclick = event => { event.stopPropagation(); selectText(item,text); };
    label.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectText(item,text); } };
    label.ondragstart = event => { event.preventDefault(); event.stopPropagation(); };
    sheet.append(label);
  }
}
function placeText(event, sheet, viewport, item, prefix = '') {
  const text = $(prefix+'text').value.trim(), size = Number($(prefix+'size').value);
  if (!movingText && (!text || !Number.isFinite(size) || size < 6 || size > 96)) return message('テキストと6〜96の文字サイズを入力してください。');
  const rect = sheet.getBoundingClientRect();
  const [x,y] = viewport.convertToPdfPoint((event.clientX-rect.left)/rect.width*viewport.width,(event.clientY-rect.top)/rect.height*viewport.height);
  if (movingText) {
    const annotation = item.id === selected && item.texts.find(t=>t.id===selectedText);
    if (!annotation) return message('移動する文字と同じページ上をクリックしてください。');
    remember(); annotation.x=x; annotation.y=y; movingText=false; placing=false; message('文字を移動しました。');
  } else {
    remember(); selectedText=crypto.randomUUID();
    item.texts.push({id:selectedText,text,x,y,size,color:$(prefix+'color').value,rotation:item.rotation});
  }
  selected = item.id; render();
}

function selectText(item, text) {
  if (busy) return;
  selected = item.id; selectedText = text.id; movingText = false; placing = false;
  for (const prefix of ['', 'preview-']) {
    $(prefix+'text').value=text.text; $(prefix+'size').value=text.size; $(prefix+'color').value=text.color;
  }
  document.querySelectorAll('.annotation').forEach(el=>el.classList.toggle('selected-annotation',el.dataset.textId===text.id));
  document.querySelectorAll('.card').forEach(el=>el.classList.toggle('active',!!el.querySelector('.selected-annotation')));
  controls(false);
  $('preview-stage').classList.remove('placing');
  $('preview-place').textContent='＋ 配置モードにする';
}
for (const prefix of ['', 'preview-']) {
  $(prefix+'update-text').onclick = () => {
    const annotation=current()?.texts.find(t=>t.id===selectedText);
    if (!annotation || busy) return;
    const text=$(prefix+'text').value.trim(),size=Number($(prefix+'size').value);
    if (!text || !Number.isFinite(size) || size<6 || size>96) return message('テキストと6〜96の文字サイズを入力してください。');
    remember(); Object.assign(annotation,{text,size,color:$(prefix+'color').value}); movingText=false; placing=false;
    for (const other of ['', 'preview-']) for (const key of ['text','size','color']) $(other+key).value=$(prefix+key).value;
    message('文字を更新しました。'); render();
  };
  $(prefix+'move-text').onclick = () => {
    if (!selectedText || busy) return;
    movingText=true; placing=true; controls(); message('同じページ上の移動先をクリックしてください。');
  };
  $(prefix+'delete-text').onclick = () => {
    const page=current(); if (!page || !selectedText || busy) return;
    remember(); page.texts=page.texts.filter(t=>t.id!==selectedText); selectedText=null; movingText=false; placing=false; message('選択した文字を削除しました。'); render();
  };
}
function togglePlacing() {
  placing = !placing; movingText = false; selectedText = null;
  document.querySelectorAll('.selected-annotation').forEach(el=>el.classList.remove('selected-annotation'));
  controls();
}

let previewVersion = 0;
async function renderPreview() {
  const version = ++previewVersion, item = current();
  if (!item) { $('preview').close(); return; }
  const index = pages.indexOf(item);
  $('preview-page').textContent = `${index+1} / ${pages.length}`;
  $('preview-prev').disabled = busy || index === 0;
  $('preview-next').disabled = busy || index === pages.length-1;
  $('preview-undo').disabled = busy || !history.length;
  $('preview-redo').disabled = busy || !future.length;
  $('preview-place').disabled = busy;
  $('preview-place').textContent = placing ? '配置モードを終了' : '＋ 配置モードにする';
  $('preview-stage').classList.toggle('placing', placing);
  try {
    const pdfPage = await sources.get(item.sourceId).pdf.getPage(item.index+1);
    if (version !== previewVersion || !$('preview').open) return;
    const viewport = pdfPage.getViewport({scale:1,rotation:item.rotation});
    const zoom = Number($('preview-zoom').value);
    const width = Math.min(760, Math.max(200, $('preview-stage').clientWidth-48)) * zoom;
    const drawing = pdfPage.getViewport({scale:Math.min(2,window.devicePixelRatio||1)*width/viewport.width,rotation:item.rotation});
    const sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.style.width = `${width}px`;
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(drawing.width); canvas.height = Math.ceil(drawing.height); sheet.append(canvas);
    addAnnotations(sheet, viewport, item);
    sheet.onclick = event => { if (placing && !busy) placeText(event,sheet,viewport,item,'preview-'); };
    $('preview-stage').replaceChildren(sheet);
    await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:drawing}).promise;
  } catch (error) { if (version === previewVersion) message(`拡大表示に失敗しました: ${error.message}`); }
}
$('expand').onclick = () => {
  if (!current() || busy) return;
  for (const id of ['text','size','color']) $('preview-'+id).value = $(id).value;
  $('preview-status').textContent = ''; $('preview').showModal(); renderPreview();
};
$('preview-close').onclick = () => $('preview').close();
$('preview').addEventListener('close', () => {
  previewVersion++;
  for (const id of ['text','size','color']) $(id).value = $('preview-'+id).value;
  placing = false; movingText=false; controls();
});
$('preview-zoom').onchange = renderPreview;
$('preview-place').onclick = togglePlacing;
$('preview-undo').onclick = () => $('undo').click();
$('preview-redo').onclick = () => $('redo').click();
for (const [id, delta] of [['preview-prev',-1],['preview-next',1]]) $(id).onclick = () => {
  const item = pages[pages.findIndex(p=>p.id===selected)+delta];
  if (item && !busy) { selected = item.id; render(); }
};

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
      doc.getPages().forEach((page,index) => pending.push({id:crypto.randomUUID(),sourceId:id,index,rotation:((page.getRotation().angle%360)+360)%360,texts:[]})); added++;
    } catch { errors.push(file.name); }
  }
  if (pending.length) { remember(); pages.push(...pending); selected = pending[0].id; }
  busy = false; $('files').value = ''; await render();
  message(`${added ? `${added} 件のPDFを追加しました。` : ''}${errors.length ? ` 読み込めません: ${errors.join('、')}（破損・暗号化されたPDFには対応していません）` : ''}`);
}
$('add-blank').onclick = async () => {
  if (busy) return;
  busy=true; controls();
  try {
    const doc=await PDFDocument.create(); doc.addPage(PageSizes.A4);
    const bytes=await doc.save(), id=crypto.randomUUID();
    const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
    remember(); sources.set(id,{bytes,pdf,name:'白紙（A4）.pdf'});
    const page={id:crypto.randomUUID(),sourceId:id,index:0,rotation:0,texts:[]};
    const index=pages.findIndex(item=>item.id===selected);
    pages.splice(index<0?pages.length:index+1,0,page);selected=page.id;selectedText=null;placing=false;movingText=false;
    message('A4白紙ページを追加しました。');
  } catch(error) { message(`白紙を追加できませんでした: ${error.message}`); }
  finally { busy=false;await render(); }
};
function duplicateSelection(ids, bulk=false) {
  if (busy) return;
  const result=duplicatePages(pages,ids);
  if (!result.copies.length) return;
  remember(); pages=result.pages;selected=result.copies[0].id;selectedText=null;placing=false;movingText=false;
  checkedPages=bulk ? new Set(result.copies.map(page=>page.id)) : new Set();
  message(`${result.copies.length}ページを複製しました。`);render();
}
$('duplicate').onclick=()=>duplicateSelection(new Set([selected]));
$('bulk-duplicate').onclick=()=>duplicateSelection(checkedPages,true);
$('files').onchange = event => addFiles([...event.target.files]);
for (const type of ['dragover','drop']) document.addEventListener(type,event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
$('drop').ondragover = event => { event.preventDefault(); $('drop').classList.add('drag'); };
$('drop').ondragleave = () => $('drop').classList.remove('drag');
$('drop').ondrop = event => { event.preventDefault(); $('drop').classList.remove('drag'); addFiles([...event.dataTransfer.files]); };
for (const [id,delta] of [['left',-1],['right',1]]) $(id).onclick = () => { if (busy) return; remember(); pages = movePage(pages,pages.findIndex(p=>p.id===selected),delta); render(); };
$('rotate').onclick = () => { const page=current(); if (!page || busy) return; remember(); for (const t of page.texts) t.rotation ??= page.rotation; page.rotation=(page.rotation+90)%360; render(); };
$('remove').onclick = () => { if (busy) return; remember(); const index=pages.findIndex(p=>p.id===selected); pages.splice(index,1); selected=pages[Math.min(index,pages.length-1)]?.id??null; render(); };
function restoreSnapshot(state) {
  pages=state.pages; selected=state.selected; selectedText=state.selectedText; checkedPages=new Set(state.checkedPages??[]); movingText=false; placing=false;
  const annotation=current()?.texts.find(text=>text.id===selectedText);
  if (annotation) for (const prefix of ['', 'preview-']) for (const key of ['text','size','color']) $(prefix+key).value=annotation[key];
  render();
}
$('undo').onclick = () => {
  if (busy || !history.length) return;
  future.push(snapshot()); restoreSnapshot(history.pop()); message('直前の操作を元に戻しました。');
};
$('redo').onclick = () => {
  if (busy || !future.length) return;
  history.push(snapshot()); restoreSnapshot(future.pop()); message('操作をやり直しました。');
};
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
  const target=event.target;
  if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  const key=event.key.toLowerCase();
  const action=key==='z' ? (event.shiftKey ? 'redo' : 'undo') : key==='y' && !event.shiftKey ? 'redo' : null;
  if (!action) return;
  event.preventDefault(); $(action).click();
});
$('addtext').onclick = () => { togglePlacing(); if (placing) message('ページ上をクリックしてテキストを配置してください。'); };
$('cleartext').onclick = () => { if (busy || !current()) return; remember(); current().texts=[]; render(); };

function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('save-project').onclick = () => {
  if (busy || !pages.length) return;
  try {
    const json = saveProject(pages,sources,selected);
    const blob = new Blob([json],{type:'application/json'});
    if (blob.size > MAX_PROJECT_BYTES) throw new Error('作業ファイルは100MB以下にしてください。');
    downloadFile(blob,outputFilename($('output-name').value,'pdfstudio')); message('作業ファイルを保存しました。あとから開いて再編集できます。');
  } catch (error) { message(`作業を保存できませんでした: ${error.message}`); }
};
$('open-project').onclick = () => $('project-file').click();
$('project-file').onchange = async event => {
  const file=event.target.files[0];
  if (!file || busy) return;
  if (pages.length && !window.confirm('現在の作業を読み込む作業ファイルに切り替えます。必要なら先に作業ファイルを保存してください。切り替え後も「元に戻す」で戻せます。')) { event.target.value=''; return; }
  busy=true; controls(); message('作業ファイルを開いています…',true);
  const staged=new Map();
  let installed=false;
  try {
    if (file.size > MAX_PROJECT_BYTES) throw new Error('作業ファイルは100MB以下にしてください。');
    const project=readProject(await file.text()), sourceIds=new Map();
    for (const [oldId, source] of project.sources) {
      const doc=await PDFDocument.load(source.bytes);
      if (project.pages.some(page=>page.sourceId===oldId && page.index>=doc.getPageCount())) throw new Error('存在しないページが指定されています。');
      const pdf=await pdfjs.getDocument({data:source.bytes.slice(),isEvalSupported:false}).promise;
      const newId=crypto.randomUUID(); sourceIds.set(oldId,newId); staged.set(newId,{...source,pdf});
    }
    let restoredSelection;
    const restoredPages=project.pages.map(page=>{
      const id=crypto.randomUUID(); if (page.id===project.selected) restoredSelection=id;
      return {...page,id,sourceId:sourceIds.get(page.sourceId),texts:page.texts.map(text=>({...text,id:crypto.randomUUID()}))};
    });
    remember(); for (const [id,source] of staged) sources.set(id,source);
    pages=restoredPages; checkedPages.clear(); selected=restoredSelection; selectedText=null; placing=false; movingText=false; installed=true;
    message('作業を復元しました。続けて編集できます。');
  } catch(error) { message(`作業を開けませんでした: ${error.message}`); }
  finally {
    if (!installed) for (const source of staged.values()) await source.pdf.destroy();
    busy=false; event.target.value=''; await render();
  }
};

async function writePdf(exportPages, filename) {
  if (busy || !exportPages.length) return; busy=true; controls(); message('PDFを書き出しています…',true);
  try {
    let fontBytes;
    if (exportPages.some(p=>p.texts.length)) { const response=await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.otf`); if (!response.ok) throw new Error('日本語フォントを読み込めません。'); fontBytes=await response.arrayBuffer(); }
    const bytes=await exportPdf(exportPages,sources,fontBytes);
    downloadFile(new Blob([bytes],{type:'application/pdf'}),filename); message('PDFを書き出しました。');
  } catch(error) { message(`書き出せませんでした: ${error.message}`); }
  finally { busy=false; controls(); }
};
$('output-name').oninput=()=>{$('output-name-hint').textContent=outputFilename($('output-name').value,'pdf');};
$('save').onclick=()=>writePdf(pages,outputFilename($('output-name').value,'pdf'));
$('bulk-export').onclick=()=>writePdf(pages.filter(page=>checkedPages.has(page.id)),outputFilename($('output-name').value,'pdf',true));
$('range-form').onsubmit=event=>{
  event.preventDefault();if (busy || !pages.length) return;
  try {
    const indices=parsePageRange($('page-range').value,pages.length);
    checkedPages=new Set(indices.map(index=>pages[index].id));
    $('range-error').textContent='';$('page-range').removeAttribute('aria-invalid');
    controls(false);message(`${checkedPages.size}ページを選択しました。`);
  } catch(error) {
    $('range-error').textContent=error.message;$('page-range').setAttribute('aria-invalid','true');
  }
};
$('page-range').oninput=()=>{$('range-error').textContent='';$('page-range').removeAttribute('aria-invalid');};
$('select-all').onchange=()=>{if (busy) return; checkedPages=$('select-all').checked ? new Set(pages.map(page=>page.id)) : new Set();controls(false);};
$('bulk-clear').onclick=()=>{if (busy) return;checkedPages.clear();controls(false);};
$('bulk-rotate').onclick=()=>{
  if (busy || !checkedPages.size) return;
  remember();
  for (const page of pages) if (checkedPages.has(page.id)) {
    for (const text of page.texts) text.rotation??=page.rotation;
    page.rotation=(page.rotation+90)%360;
  }
  message(`${checkedPages.size}ページを回転しました。`);render();
};
$('bulk-delete').onclick=()=>{
  if (busy || !checkedPages.size) return;
  remember(); const count=checkedPages.size;
  pages=pages.filter(page=>!checkedPages.has(page.id));checkedPages.clear();
  if (!pages.some(page=>page.id===selected)) {selected=pages[0]?.id??null;selectedText=null;}
  placing=false;movingText=false;message(`${count}ページを削除しました。`);render();
};
window.addEventListener('beforeunload',event => { if (pages.length) { event.preventDefault(); event.returnValue=''; } });
render();
