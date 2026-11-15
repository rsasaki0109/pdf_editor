import test from 'node:test';
import assert from 'node:assert/strict';
import { outputFilename } from '../src/filename.js';
test('Japanese names share a stem across PDF, selected PDF and project exports',()=>{
  assert.equal(outputFilename(' 会議資料.pdf ','pdf'),'会議資料.pdf');
  assert.equal(outputFilename('会議資料.PDF','pdf',true),'会議資料-selected.pdf');
  assert.equal(outputFilename('会議資料.pdfstudio','pdfstudio'),'会議資料.pdfstudio');
});
test('empty, unsafe, reserved and long names produce portable filenames',()=>{
  assert.equal(outputFilename(' ... ','pdf'),'document.pdf');
  assert.equal(outputFilename('../資料:最終?','pdf'),'_資料_最終_.pdf');
  assert.equal(outputFilename('CON','pdf'),'_CON.pdf');
  assert.equal(outputFilename('aux.notes','pdfstudio'),'_aux.notes.pdfstudio');
  assert.equal([...outputFilename('あ'.repeat(200),'pdf')].length,104);
});
