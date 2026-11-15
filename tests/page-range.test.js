import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRange } from '../src/page-range.js';
test('ranges are deduplicated and returned in current page order',()=>{
  assert.deepEqual(parsePageRange('5, 1-3, 2, 3-4',5),[0,1,2,3,4]);
  assert.deepEqual(parsePageRange('３〜５、１，２–３',5),[0,1,2,3,4]);
  assert.deepEqual(parsePageRange(' 02 - 02 ',3),[1]);
});
test('invalid and out of bounds input fails without partial selection',()=>{
  for(const value of ['', '0','1,99','3-2','-1','1.5','1,,2','1-','1-2-3','1e2','Infinity','999999999999999999999999','1,']) assert.throws(()=>parsePageRange(value,5));
});
