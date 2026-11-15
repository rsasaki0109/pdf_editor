import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProject, readProject } from '../src/project.js';
function fixture() {
  const sources=new Map([['source',{name:'日本語.pdf',bytes:new Uint8Array([0,127,128,255])}],['unused',{name:'unused.pdf',bytes:new Uint8Array([9])}]]);
  const pages=[{id:'page',sourceId:'source',index:2,rotation:90,texts:[{id:'text',text:'再編集できる文字',x:12.5,y:-3,size:24,color:'#abcdef',rotation:0}]}];
  return {sources,pages};
}
test('project preserves binary PDF, Japanese text, rotation, position and selection; omits unused sources',()=>{
  const {sources,pages}=fixture(); const restored=readProject(saveProject(pages,sources,'page'));
  assert.deepEqual(restored.pages,pages); assert.equal(restored.selected,'page');
  assert.deepEqual(restored.sources.get('source'),sources.get('source'));assert.equal(restored.sources.has('unused'),false);
});
test('corrupted, foreign or invalid project data is rejected',()=>{
  const {sources,pages}=fixture(); const json=saveProject(pages,sources,'page');
  for (const mutate of [d=>d.version=9,d=>d.sources.push(d.sources[0]),d=>d.sources[0].data='!!!=',d=>d.pages.push(d.pages[0]),d=>d.pages[0].sourceId='missing',d=>d.pages[0].index=-1,d=>d.pages[0].rotation=13,d=>d.pages[0].texts[0].size=1000,d=>d.pages[0].texts[0].color='red',d=>d.pages[0].texts[0].rotation=null,d=>d.pages[0].texts.push(d.pages[0].texts[0]),d=>d.selected='missing']) {
    const data=JSON.parse(json);mutate(data);assert.throws(()=>readProject(JSON.stringify(data)));
  }
  for (const value of ['null','{}','broken']) assert.throws(()=>readProject(value));
});
