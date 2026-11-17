import test from 'node:test';
import assert from 'node:assert/strict';
import {pageNumberToIndex,movePageTo} from '../src/page-position.js';
test('page positions accept full-width numbers and reject invalid targets',()=>{
 assert.equal(pageNumberToIndex(' ３ ',3),2);assert.equal(pageNumberToIndex('1',3),0);
 for(const input of ['','0','4','-1','1.5','1e0','1,2','Infinity']) assert.throws(()=>pageNumberToIndex(input,3));
});
test('moving to final positions preserves other pages, object identity and original order',()=>{
 const pages=[{id:'a',texts:[{text:'保持'}]},{id:'b'},{id:'c'}];
 const last=movePageTo(pages,0,2);assert.deepEqual(last.map(p=>p.id),['b','c','a']);assert.equal(last[2],pages[0]);
 assert.deepEqual(movePageTo(pages,2,0).map(p=>p.id),['c','a','b']);assert.deepEqual(pages.map(p=>p.id),['a','b','c']);assert.equal(movePageTo(pages,1,1),pages);
 assert.throws(()=>movePageTo(pages,0,3));assert.throws(()=>movePageTo(pages,-1,0));
});
