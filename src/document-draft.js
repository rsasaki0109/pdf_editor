import {DOCUMENT_TYPES} from './oss-documents.js';
export const emptyDrafts=()=>Object.fromEntries(Object.entries(DOCUMENT_TYPES).map(([key,config])=>[key,{title:'',author:'',abstract:'',references:'',sections:Object.fromEntries(config.sections.map(([id])=>[id,'']))}]));
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
