import test from 'node:test';
import assert from 'node:assert/strict';
import {readFigures} from '../src/document-figures.js';
import {emptyDrafts,readDocumentDraft} from '../src/document-draft.js';
import {flow,bar} from './fixtures/document-figures.js';
test('figures survive editable-draft round trips and old drafts retain their shape',()=>{
 const drafts=emptyDrafts();const old={format:'oss-document-draft',schema:1,type:'paper',drafts};
 assert.deepEqual(readDocumentDraft(JSON.stringify(old)).drafts,drafts);
 drafts.paper.figures=[flow,bar];drafts.guide.figures=[];
 assert.deepEqual(readDocumentDraft(JSON.stringify(old)).drafts,drafts);
 const restored=readFigures([flow,bar]);restored[0].steps[0].title='変更';assert.equal(flow.steps[0].title,'入力');
});
test('figure validation rejects unsupported shapes, missing evidence labels and misleading ranges',()=>{
 for(const invalid of [null,{},Array(9).fill(flow),[{...flow,source:' '}],[{...flow,kind:'image'}],[{...flow,steps:[{title:'入力'}]}],[{...bar,bars:[]}],...[-1,null,NaN,Infinity,1e13].map(value=>[{...bar,bars:[{label:'A',value}]}]),[{...bar,bars:[{label:'A',value:5,min:6,max:7}]}],[{...bar,bars:[{label:'A',value:5,min:0}]}]])assert.throws(()=>readFigures(invalid));
 assert.equal(readFigures([{...bar,bars:[{label:'Zero',value:0}]}])[0].bars[0].value,0);
 assert.equal(readFigures([{...flow,source:'出典\n'.repeat(90)}])[0].source.includes('\n'),false);
});
