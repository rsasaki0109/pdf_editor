import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { exportPdf, movePage } from '../src/model.js';
test('merge, reorder, delete, rotation and Japanese text survive export', async () => {
  const a=await PDFDocument.create(); a.addPage([300,500]); a.addPage([400,600]);
  const b=await PDFDocument.create(); b.addPage([200,350]);
  const sources=new Map([['a',{bytes:await a.save()}],['b',{bytes:await b.save()}]]);
  let pages=[{sourceId:'a',index:0,rotation:0,texts:[]},{sourceId:'a',index:1,rotation:90,texts:[]},{sourceId:'b',index:0,rotation:0,texts:[]}];
  pages=movePage(pages,2,-1); pages.splice(0,1);
  pages[0].texts.push({text:'日本語のテスト',x:20,y:50,size:18,color:'#123456'});
  const result=await exportPdf(pages,sources,await readFile(new URL('../public/fonts/NotoSansJP-Regular.otf',import.meta.url)));
  const doc=await PDFDocument.load(result);
  assert.equal(doc.getPageCount(),2);
  assert.equal(doc.getPage(0).getWidth(),200);
  assert.equal(doc.getPage(1).getWidth(),400);
  assert.equal(doc.getPage(1).getRotation().angle,90);
  assert.ok(result.length>1000);
});
test('out of bounds moves leave order intact; empty export is rejected', async () => {
  const pages=[{id:1},{id:2}];
  assert.deepEqual(movePage(pages,0,-1),pages);
  assert.deepEqual(movePage(pages,1,1),pages);
  await assert.rejects(exportPdf([],new Map()),/ページ/);
});
test('duplicated pages retain order and rotation; edits never mutate originals', async () => {
  const { duplicatePages } = await import('../src/model.js');
  const original={id:'original',sourceId:'pdf',index:0,rotation:90,texts:[{id:'note',text:'原本',x:10,y:20,size:18,color:'#123456',rotation:0}]};
  const last={id:'last',sourceId:'pdf',index:1,rotation:0,texts:[]};
  const result=duplicatePages([original,last],new Set(['original','last']));
  assert.equal(result.pages.length,4);assert.equal(result.copies.length,2);
  assert.equal(result.pages[0],original);assert.equal(result.pages[2],last);
  const copy=result.copies[0];assert.notEqual(copy.id,original.id);assert.notEqual(copy.texts[0].id,original.texts[0].id);
  assert.equal(copy.rotation,90);assert.equal(copy.sourceId,'pdf');
  copy.texts[0].text='コピー';copy.rotation=180;
  assert.equal(original.texts[0].text,'原本');assert.equal(original.rotation,90);
});
