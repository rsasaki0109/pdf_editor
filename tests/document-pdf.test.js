import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {createDocumentPdf} from '../src/document-pdf.js';
const draft={title:'日本語OSS0109の技術資料',author:'著者 / 開発者',abstract:'ブラウザ内で資料を作成する。',references:'[1] https://github.com/example0109/oss',sections:{background:'背景です。',design:'設計です。',implementation:'実装です。',evaluation:'テストを実施した。',discussion:'課題を記録する。',overview:'利用者向けの説明。',installation:'npm install\nnpm run dev',usage:'ファイルを選択する。',features:'PDFを生成する。',troubleshooting:'問題があれば設定を確認する。'}};
test('paper and guide export readable Japanese, distinct column layouts and paginated long manuscripts',async()=>{
 const font=await readFile('public/fonts/NotoSansJP-Regular.ttf');const dir=await mkdtemp(path.join(tmpdir(),'oss-doc-'));
 try {
  for(const type of ['paper','guide']){
   const long={...draft,sections:{...draft.sections,[type==='paper'?'implementation':'usage']:('日本語の長い本文と英語EnglishおよびURL https://github.com/example/oss を確認します。\n').repeat(85)}};
   const bytes=await createDocumentPdf(type,long,font),doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>1);assert.ok(doc.getPageCount()<20);assert.equal(doc.getTitle(),draft.title);
   const file=path.join(dir,`${type}.pdf`);await writeFile(file,bytes);const text=spawnSync('/usr/bin/pdftotext',['-layout',file,'-'],{encoding:'utf8'});assert.equal(text.status,0);assert.equal(text.stderr,'');assert.ok(text.stdout.includes('日本語OSS0109の技術資料'));assert.ok(text.stdout.includes('著者 / 開発者'));assert.ok(text.stdout.includes(type==='paper'?'考察・課題':'トラブル対処・制約'));assert.ok(text.stdout.replace(/\s/g,'').includes('https://github.com/example0109/oss'));
   const bbox=spawnSync('/usr/bin/pdftotext',['-bbox',file,'-'],{encoding:'utf8'});assert.equal(bbox.status,0);
   for(const match of bbox.stdout.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)){
    const [,x1,y1,x2,y2]=match.map(Number);assert.ok(x1>=45&&x2<=550,`horizontal overflow ${match[0]}`);assert.ok(y1>=20&&y2<=820,`vertical overflow ${match[0]}`);
   }
  }
  await assert.rejects(createDocumentPdf('paper',{...draft,title:''},font),/タイトル/);
 } finally{await rm(dir,{recursive:true,force:true});}
});
