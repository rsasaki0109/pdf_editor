import {DOCUMENT_TYPES,createDrafts,fetchRepository} from './oss-documents.js';
import {createDocumentPdf} from './document-pdf.js';
import {outputFilename} from './filename.js';
const emptyDrafts=()=>Object.fromEntries(Object.entries(DOCUMENT_TYPES).map(([key,config])=>[key,{title:'',author:'',abstract:'',references:'',sections:Object.fromEntries(config.sections.map(([id])=>[id,'']))}]));
export function readDocumentDraft(value) {
  let data;try {data=JSON.parse(value);} catch {throw new Error('下書きファイルを読み込めません。');}
  if (data?.format!=='oss-document-draft' || data.schema!==1 || !Object.hasOwn(DOCUMENT_TYPES,data.type)) throw new Error('対応していない下書きファイルです。');
  const drafts=emptyDrafts();
  for (const [type,config] of Object.entries(DOCUMENT_TYPES)) {
    const source=data.drafts?.[type];if (!source) throw new Error('下書きの内容が不足しています。');
    for (const key of ['title','author','abstract','references']) {
      if (typeof source[key]!=='string' || source[key].length>(['title','author'].includes(key)?300:6000)) throw new Error('下書きの内容を確認してください。');
      drafts[type][key]=source[key];
    }
    for (const [id] of config.sections) {
      if (typeof source.sections?.[id]!=='string' || source.sections[id].length>12000) throw new Error('下書きの章を確認してください。');
      drafts[type].sections[id]=source.sections[id];
    }
  }
  return {type:data.type,drafts};
}
export function setupDocumentBuilder({addFiles,isBusy,setBusy,downloadFile}) {
  const $=id=>document.getElementById(id),dialog=$('document-builder');
  let type='paper',drafts=emptyDrafts(),working=false,generating=false,controller,dirty=false;
  function collect() {
    return {title:$('builder-doc-title').value,author:$('builder-author').value,abstract:$('builder-abstract').value,references:$('builder-references').value,
      sections:Object.fromEntries(DOCUMENT_TYPES[type].sections.map(([id])=>[id,$(`builder-section-${id}`).value]))};
  }
  function render() {
    const draft=drafts[type];
    $('builder-type').value=type;
    for(const [id,key] of [['doc-title','title'],['author','author'],['abstract','abstract'],['references','references']]) $('builder-'+id).value=draft[key];
    $('builder-sections').replaceChildren();
    for(const [id,title] of DOCUMENT_TYPES[type].sections) {
      const label=document.createElement('label');label.className='field';label.textContent=title;
      const textarea=document.createElement('textarea');textarea.id=`builder-section-${id}`;textarea.rows=6;textarea.maxLength=12000;textarea.value=draft.sections[id];
      textarea.placeholder=type==='paper'&&id==='evaluation'?'実施したテスト、条件、結果を記入してください。未実施の場合は空欄のままにできます。':'READMEに記載がない内容は、確認した事実に基づいて追記してください。';
      label.append(textarea);$('builder-sections').append(label);
    }
  }
  function status(value) {$('builder-status').textContent=value;}
  function lock(value) {
    working=value;
    dialog.querySelectorAll('input,textarea,select,button').forEach(element=>element.disabled=value);
    $('builder-close').disabled=generating;
  }
  const hasContent=()=>Object.values(drafts).some(draft=>draft.title||draft.abstract||Object.values(draft.sections).some(Boolean));
  dialog.addEventListener('input',event=>{if(event.target.id!=='builder-repository' && event.target.id!=='builder-draft-file')dirty=true;});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  $('open-document-builder').onclick=()=>{if(!isBusy()){dialog.showModal();}};
  $('builder-close').onclick=()=>dialog.close();
  dialog.oncancel=event=>{if(generating)event.preventDefault();};
  dialog.onclose=()=>{drafts[type]=collect();controller?.abort();};
  $('builder-type').onchange=()=>{drafts[type]=collect();type=$('builder-type').value;render();status('ドキュメントを切り替えました。もう一方の原稿も保持しています。');};
  $('builder-import-form').onsubmit=async event=>{
    event.preventDefault();if(working)return;drafts[type]=collect();
    if(hasContent()&&!window.confirm('READMEから読み込むと、論文とガイドの下書きを置き換えます。必要なら先に「下書きを保存」を使ってください。'))return;
    lock(true);status('GitHubのREADMEを読み込んでいます…');controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const source=await fetchRepository($('builder-repository').value,{signal:controller.signal});
      if(controller.signal.aborted)return;
      drafts=createDrafts(source);dirty=true;render();$('builder-source').textContent=`出典: ${source.url}`;
      status('READMEの抜粋を章に分けました。空欄の評価や手順を確認・追記してください。');
    } catch(error) {status(error.name==='AbortError'?'読み込みを中止しました。時間をおいて再試行できます。':`読み込めませんでした: ${error.message}`);}
    finally {clearTimeout(timeout);lock(false);controller=null;}
  };
  $('builder-save-draft').onclick=()=>{
    drafts[type]=collect();
    downloadFile(new Blob([JSON.stringify({format:'oss-document-draft',schema:1,type,drafts},null,2)],{type:'application/json'}),outputFilename(drafts[type].title||'oss-document','json'));
    dirty=false;status('論文とガイドの下書きを保存しました。');
  };
  $('builder-open-draft').onclick=()=>$('builder-draft-file').click();
  $('builder-draft-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>1000000)throw new Error('下書きは1MB以下にしてください。');
      const data=readDocumentDraft(await file.text());drafts[type]=collect();
      if(hasContent()&&!window.confirm('現在の下書きを、保存した下書きに置き換えますか？'))return;
      drafts=data.drafts;type=data.type;dirty=false;render();$('builder-source').textContent='';status('下書きを復元しました。');
    } catch(error) {status(error.message);}
    finally {event.target.value='';}
  };
  async function generate(add) {
    if(working||isBusy())return;drafts[type]=collect();const draft=drafts[type];
    if(!draft.title.trim()){status('タイトルを入力してください。');$('builder-doc-title').focus();return;}
    if(!draft.abstract.trim()&&!Object.values(draft.sections).some(value=>value.trim())){status('要旨または本文を入力してください。');return;}
    generating=true;lock(true);setBusy(true);status('日本語フォントを埋め込んでPDFを作成しています…');
    let file;
    try {
      const response=await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`);
      if(!response.ok)throw new Error('日本語フォントを読み込めません。');
      const bytes=await createDocumentPdf(type,draft,await response.arrayBuffer()),name=outputFilename(draft.title,'pdf');
      if(add)file=new File([bytes],name,{type:'application/pdf'});
      else downloadFile(new Blob([bytes],{type:'application/pdf'}),name);
      status(add?'編集画面に追加しています…':'PDFを保存しました。');
    } catch(error) {status(`PDFを作成できませんでした: ${error.message}`);}
    finally {generating=false;setBusy(false);lock(false);}
    if(file){dialog.close();await addFiles([file]);}
  }
  $('builder-download').onclick=()=>generate(false);$('builder-add').onclick=()=>generate(true);
  render();
}
