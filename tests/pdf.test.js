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
