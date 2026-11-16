import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSearch,searchSnippet} from '../src/search.js';
test('search normalizes Japanese width, whitespace and English case',()=>{
 assert.equal(normalizeSearch('ＡＢＣ　日本\n語'),'abc日本語');
 assert.equal(searchSnippet('請求書 合計 １００ 円','合計100円'),'請求書合計100円');
 assert.equal(searchSnippet('Page 2','ＰＡＧＥ２'),'page2');
 assert.equal(searchSnippet('カタカナ','ｶﾀｶﾅ'),'カタカナ');
});
test('empty and absent queries do not match, snippets retain match context',()=>{
 assert.equal(searchSnippet('文書',' '),null);assert.equal(searchSnippet('文書','別'),null);
 const result=searchSnippet('前'.repeat(100)+'検索対象'+'後'.repeat(100),'検索対象');
 assert.ok(result.startsWith('…'));assert.ok(result.endsWith('…'));assert.ok(result.includes('検索対象'));assert.ok(result.length<60);
});
