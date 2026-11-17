import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRepositoryUrl,createDrafts,fetchRepository} from '../src/oss-documents.js';
import {readDocumentDraft} from '../src/document-builder.js';
const source={url:'https://github.com/example/oss',fullName:'example/oss',description:'実装の紹介',readmeUrl:'https://github.com/example/oss/blob/main/README.md',readme:'# OSS\n日本語の概要です。\n## Architecture\nBrowser local.\n## インストール\n```sh\nnpm run my_task\npython __init__.py\n```\n## 使い方\n最初にファイルを開く。\n## 制約\nOCR未対応。'};
test('repository URL accepts only public GitHub repository locations',()=>{
 assert.deepEqual(parseRepositoryUrl('https://github.com/example/oss.git/'),{owner:'example',repo:'oss',url:source.url});
 for(const value of ['https://evil.com/example/oss','http://github.com/example/oss','https://token@github.com/example/oss','https://github.com/example/oss/tree/main','garbage'])assert.throws(()=>parseRepositoryUrl(value));
});
test('drafts are README excerpts, preserve commands, leave missing evidence empty and cite sources',()=>{
 const drafts=createDrafts(source);assert.equal(drafts.paper.sections.evaluation,'');assert.equal(drafts.paper.sections.implementation,'');
 assert.ok(drafts.paper.sections.design.includes('Browser local.'));assert.ok(drafts.guide.sections.installation.includes('npm run my_task'));assert.ok(drafts.guide.sections.installation.includes('python __init__.py'));
 assert.ok(drafts.guide.sections.usage.includes('ファイルを開く'));assert.ok(drafts.guide.sections.troubleshooting.includes('OCR未対応'));
 assert.ok(drafts.paper.references.includes(source.readmeUrl));assert.equal(drafts.paper.author,'');
 const restored=readDocumentDraft(JSON.stringify({format:'oss-document-draft',schema:1,type:'guide',drafts}));assert.deepEqual(restored.drafts,drafts);
 assert.throws(()=>readDocumentDraft('{}'));assert.throws(()=>readDocumentDraft(JSON.stringify({format:'oss-document-draft',schema:1,type:'__proto__',drafts}))); assert.throws(()=>readDocumentDraft(JSON.stringify({format:'oss-document-draft',schema:1,type:'paper',drafts:{paper:{...drafts.paper,title:123}}})));
});
test('GitHub reading decodes Japanese and reports rate limits and missing README',async()=>{
 const calls=[];const result=await fetchRepository(source.url,{fetcher:async url=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('/readme')?{encoding:'base64',content:Buffer.from(source.readme).toString('base64'),path:'README.md'}:{full_name:'example/oss',description:source.description,default_branch:'main'}};}});
 assert.equal(result.readme,source.readme);assert.equal(calls.length,2);
 for(const [status,message] of [[404,/見つかりません/],[403,/アクセス制限/]])await assert.rejects(fetchRepository(source.url,{fetcher:async()=>({ok:false,status})}),message);
});
