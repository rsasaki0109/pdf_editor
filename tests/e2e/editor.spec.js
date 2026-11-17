import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// Serve the exact production bundle through request routing. No preview daemon needed.
test.beforeEach(async ({page})=>{
  await page.route('http://localhost:4217/**',async route=>{
    const url=new URL(route.request().url());
    const file=path.resolve('dist','.'+(url.pathname==='/'?'/index.html':url.pathname));
    const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.ttf':'font/ttf'};
    if (!file.startsWith(path.resolve('dist')+path.sep)) return route.fulfill({status:404});
    try { await route.fulfill({body:await fs.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'}); }
    catch { await route.fulfill({status:404}); }
  });
  await page.goto('http://localhost:4217/');
  page.on('dialog',dialog=>dialog.accept());
});
async function fixture(){
  const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<3;i++){const p=doc.addPage([400,500]);p.drawText(`Page ${i+1}`,{x:30,y:450,font,size:24});}
  return {name:'sample.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
async function download(page,button,file){const next=page.waitForEvent('download');await page.locator(button).click();const d=await next;await d.saveAs(file);return d;}
test('edit, save project, reload, restore and export Japanese PDF',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
  await page.locator('#right').click();await page.locator('#rotate').click();
  await page.locator('#tab-text').click();await page.locator('#text').fill('日本語の表示確認 ABC 123');
  await page.locator('#addtext').click();await page.locator('.sheet').nth(1).click({position:{x:40,y:90}});
  await expect(page.locator('#pages .annotation')).toHaveText('日本語の表示確認 ABC 123');
  const project=info.outputPath('session.pdfstudio');await download(page,'#save-project',project);
  await page.reload();await page.locator('#project-file').setInputFiles(project);await expect(page.locator('.card')).toHaveCount(3);
  await page.locator('#pages .annotation').click();await page.locator('#text').fill('日本語の表示確認 ABC 123 完了');await page.locator('#update-text').click();
  await expect(page.locator('#pages .annotation')).toHaveText('日本語の表示確認 ABC 123 完了');
  await page.locator('#output-name').fill('日本語テスト');const file=info.outputPath('output.pdf');
  const d=await download(page,'#save',file);expect(d.suggestedFilename()).toBe('日本語テスト.pdf');
  const pdf=await PDFDocument.load(await fs.readFile(file));expect(pdf.getPageCount()).toBe(3);expect(pdf.getPage(1).getRotation().angle).toBe(90);
  const extracted=spawnSync('/usr/bin/pdftotext',[file,'-'],{encoding:'utf8'});expect(extracted.status).toBe(0);expect(extracted.stderr).toBe('');expect(extracted.stdout).toContain('日本語の表示確認 ABC 123 完了');
  // Poppler must decode and render the embedded font without syntax warnings.
  const raster=spawnSync('/usr/bin/pdftoppm',['-f','2','-singlefile','-scale-to','700','-png',file,info.outputPath('render')],{encoding:'utf8'});expect(raster.status).toBe(0);expect(raster.stderr).toBe('');
  await page.locator('#files').setInputFiles({name:'exported.pdf',mimeType:'application/pdf',buffer:await fs.readFile(file)});
  await expect(page.locator('.card')).toHaveCount(6);await page.locator('.card').nth(4).click();await page.locator('#tab-page').click();await page.locator('#expand').click();
  await expect(page.locator('#preview-stage canvas')).toHaveAttribute('data-rendered','true');
  // Normalize canvas dimensions for deterministic PDF rendering snapshots on both viewports.
  const image=await page.locator('#preview-stage canvas').evaluate(canvas=>canvas.toDataURL());
  const renderPage=await page.context().newPage();await renderPage.setViewportSize({width:700,height:560});
  await renderPage.setContent(`<style>body{margin:0}img{width:700px;height:560px}</style><img src="${image}">`);
  await expect(renderPage.locator('img')).toHaveScreenshot('japanese-export.png',{maxDiffPixels:100});
  const poppler=await fs.readFile(info.outputPath('render.png'));
  await renderPage.setContent(`<style>body{margin:0}img{width:700px;height:560px}</style><img src="data:image/png;base64,${poppler.toString('base64')}">`);
  await expect(renderPage.locator('img')).toHaveScreenshot('poppler-export.png',{maxDiffPixels:100});
  await renderPage.close();expect(errors).toEqual([]);
});
test('ranges, bulk actions, independent duplicates and history',async({page})=>{
  await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
  await page.locator('#bulk-tools summary').click();await page.locator('#page-range').fill('１、３');await page.locator('#range-apply').click();await expect(page.locator('.page-check:checked')).toHaveCount(2);
  await page.locator('#page-range').fill('1,99');await page.locator('#range-apply').click();await expect(page.locator('#range-error')).not.toBeEmpty();await expect(page.locator('.page-check:checked')).toHaveCount(2);
  await page.locator('#bulk-delete').click();await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('#undo').click();await expect(page.locator('.card')).toHaveCount(3);await expect(page.locator('.page-check:checked')).toHaveCount(2);
  await page.locator('#bulk-duplicate').click();await expect(page.locator('.card')).toHaveCount(5);
  await page.locator('#undo').click();await expect(page.locator('.card')).toHaveCount(3);
  await page.locator('#redo').click();await expect(page.locator('.card')).toHaveCount(5);
  await page.locator('#add-blank').click();await expect(page.locator('.card')).toHaveCount(6);
  await page.locator('#count').click();await page.keyboard.press('Control+z');await expect(page.locator('.card')).toHaveCount(5);
  await page.keyboard.press('Control+Shift+z');await expect(page.locator('.card')).toHaveCount(6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('copied text stays independent and broken projects preserve current work',async({page},info)=>{
  await page.locator('#add-blank').click();await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('#tab-page').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#tab-text')).toHaveAttribute('aria-selected','true');
  await page.locator('#text').fill('原本');await page.locator('#addtext').click();await page.locator('.sheet').click({position:{x:30,y:80}});
  await page.locator('#tab-page').click();await page.locator('#duplicate').click();await expect(page.locator('.card')).toHaveCount(2);
  await page.locator('#pages .annotation').nth(1).click();await page.locator('#text').fill('コピー');await page.locator('#update-text').click();await expect(page.locator('#pages .annotation')).toHaveText(['原本','コピー']);
  await page.locator('#project-file').setInputFiles({name:'bad.pdfstudio',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#status')).toContainText('壊れた作業ファイル');
  await expect(page.locator('.card')).toHaveCount(2);await expect(page.locator('#pages .annotation')).toHaveText(['原本','コピー']);
  await page.locator('#output-name').fill('白紙から作成');const file=info.outputPath('blank.pdf');await download(page,'#save',file);
  const pdf=await PDFDocument.load(await fs.readFile(file));expect(pdf.getPageCount()).toBe(2);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28,1);
});
test('search finds original and added text and follows edits and page changes',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
 await page.locator('#document-query').fill('ＰＡＧＥ ２');await expect(page.locator('.search-result')).toHaveCount(1);await expect(page.locator('.search-result strong')).toHaveText('2ページ目');
 await page.locator('.search-result').click();await expect(page.locator('#selected')).toHaveText('2 ページ目');
 await page.locator('#duplicate').click();await expect(page.locator('.card')).toHaveCount(4);await expect(page.locator('.search-result')).toHaveCount(2);
 await page.locator('.search-result').nth(1).click();await expect(page.locator('#selected')).toHaveText('3 ページ目');await page.locator('#remove').click();await expect(page.locator('.search-result')).toHaveCount(1);
 await page.locator('#undo').click();await expect(page.locator('.search-result')).toHaveCount(2);
 await page.locator('.search-result').first().click();await page.locator('#left').click();await expect(page.locator('.search-result strong')).toHaveText(['1ページ目','3ページ目']);
 await page.locator('#search-clear').click();await expect(page.locator('.search-result')).toHaveCount(0);await expect(page.locator('#search-status')).toBeEmpty();
 await page.locator('#tab-text').click();await page.locator('#text').fill('請求 合計 １００ 円');await page.locator('#addtext').click();await page.locator('.sheet').first().click({position:{x:30,y:90}});
 await page.locator('#document-query').fill('合計100円');await expect(page.locator('.search-result')).toHaveCount(1);
 await page.locator('#pages .annotation').click();await page.locator('#text').fill('金額２００円');await page.locator('#update-text').click();await expect(page.locator('.search-result')).toHaveCount(0);await expect(page.locator('#search-status')).toContainText('0ページ');
 await page.locator('#document-query').fill('金額200円');await expect(page.locator('.search-result')).toHaveCount(1);
 await page.locator('#document-query').fill('Page');await page.locator('#document-query').fill('not-present');await expect(page.locator('#search-status')).toContainText('0ページ');await expect(page.locator('.search-result')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
});
test('page operations work inside the enlarged preview including last-page deletion',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
 await page.locator('#expand').click();await expect(page.locator('#preview-page')).toHaveText('1 / 3');
 await page.locator('#preview-rotate').click();
 await expect.poll(()=>page.locator('#preview-stage canvas').evaluate(c=>c.width>c.height)).toBeTruthy();
 await page.locator('#preview-duplicate').click();await expect(page.locator('#preview-page')).toHaveText('2 / 4');
 await expect(page.locator('#preview')).toBeVisible();await expect(page.locator('.card')).toHaveCount(4);
 await page.locator('#preview-remove').click();await expect(page.locator('#preview-page')).toHaveText('2 / 3');
 await page.locator('#preview-undo').click();await expect(page.locator('#preview-page')).toHaveText('2 / 4');
 await page.locator('#preview-redo').click();await expect(page.locator('#preview-page')).toHaveText('2 / 3');
 await page.locator('#preview-zoom').selectOption('0.75');await expect(page.locator('#preview-stage canvas')).toHaveAttribute('data-rendered','true');
 await page.screenshot({path:info.outputPath('preview-page-actions.png')});
 await page.locator('#preview-close').click();const file=info.outputPath('edited.pdf');await download(page,'#save',file);
 const result=await PDFDocument.load(await fs.readFile(file));expect(result.getPageCount()).toBe(3);expect(result.getPage(0).getRotation().angle).toBe(90);expect(result.getPage(1).getRotation().angle).toBe(0);
 await page.locator('#expand').click();
 for(let count=2;count>=0;count--){await page.locator('#preview-remove').click();await expect(page.locator('.card')).toHaveCount(count);}
 await expect(page.locator('#preview')).not.toBeVisible();await expect(page.locator('#save')).toBeDisabled();
 await page.locator('#undo').click();await expect(page.locator('.card')).toHaveCount(1);await page.locator('#expand').click();await expect(page.locator('#preview-page')).toHaveText('1 / 1');
 expect(errors).toEqual([]);
});
test('numbered page moves preserve selection and history; preview jumps do not reorder pages',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
 await page.locator('.page-check').first().check();await page.locator('#move-page-number').fill('３');await page.locator('#move-page-number').press('Enter');
 await expect(page.locator('#selected')).toHaveText('3 ページ目');await expect(page.locator('.page-check').nth(2)).toBeChecked();
 await page.locator('#undo').click();await expect(page.locator('#selected')).toHaveText('1 ページ目');await expect(page.locator('#redo')).toBeEnabled();
 await page.locator('#move-page-number').fill('1');await page.locator('#move-page-apply').click();await expect(page.locator('#redo')).toBeEnabled();
 await page.locator('#move-page-number').fill('4');await page.locator('#move-page-apply').click();await expect(page.locator('#move-page-error')).not.toBeEmpty();await expect(page.locator('#selected')).toHaveText('1 ページ目');
 await page.locator('#redo').click();await expect(page.locator('#selected')).toHaveText('3 ページ目');
 await page.locator('#expand').click();await page.locator('#preview-jump-number').fill('１');await page.locator('#preview-jump-number').press('Enter');await expect(page.locator('#preview-page')).toHaveText('1 / 3');
 await page.locator('#preview-jump-number').fill('0');await page.locator('#preview-jump-apply').click();await expect(page.locator('#preview-jump-error')).not.toBeEmpty();await expect(page.locator('#preview-page')).toHaveText('1 / 3');
 await page.locator('#preview-jump-number').fill('2');await page.locator('#preview-jump-number').press('Enter');await expect(page.locator('#preview-page')).toHaveText('2 / 3');await expect(page.locator('#preview-jump-error')).toBeEmpty();
 if(info.project.name==='mobile') await page.setViewportSize({width:390,height:600});
 await page.screenshot({path:info.outputPath('numbered-page-navigation.png')});
 await expect(page.locator('#preview-close')).toBeInViewport();await expect(page.locator('#preview-jump-number')).toBeInViewport();
 await page.locator('#preview-close').click();const project=info.outputPath('order.pdfstudio');await download(page,'#save-project',project);
 const data=JSON.parse(await fs.readFile(project,'utf8'));expect(data.pages.map(p=>p.index)).toEqual([1,2,0]);
 const file=info.outputPath('reordered.pdf');await download(page,'#save',file);const text=spawnSync('/usr/bin/pdftotext',[file,'-'],{encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout.indexOf('Page 2')).toBeLessThan(text.stdout.indexOf('Page 3'));expect(text.stdout.indexOf('Page 3')).toBeLessThan(text.stdout.indexOf('Page 1'));
 expect(errors).toEqual([]);
});
test('GitHub README becomes editable paper and guide; both drafts survive save and reload',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const readme='# OSS Sample\n日本語のOSSです。\n## Architecture\n処理をブラウザ内で実行します。\n## インストール\n```sh\nnpm install\nnpm run my_task\n```\n## 使い方\nファイルを選択して保存します。\n## 主な機能\n文書作成。\n## 制約\nOCRは未対応です。';
 await page.route('https://api.github.com/repos/example/oss**',async route=>{
  const isReadme=new URL(route.request().url()).pathname.endsWith('/readme');
  await route.fulfill({json:isReadme?{encoding:'base64',content:Buffer.from(readme).toString('base64'),path:'README.md'}:{full_name:'example/oss',description:'OSSの紹介',default_branch:'main'},headers:{'access-control-allow-origin':'*'}});
 });
 await page.locator('#open-document-builder').click();await page.locator('#builder-repository').fill('https://github.com/example/oss');await page.locator('#builder-import').click();
 await expect(page.locator('#builder-doc-title')).toHaveValue('example/oss — 技術論文');await expect(page.locator('#builder-section-evaluation')).toHaveValue('');
 expect(await page.locator('#builder-references').inputValue()).toContain('https://github.com/example/oss/blob/main/README.md');
 await page.locator('#builder-doc-title').fill('OSSの技術論文');await page.locator('#builder-author').fill('開発者 / 技術部');await page.locator('#builder-section-evaluation').fill('入力した条件で動作テストを実施した。');
 const paper=info.outputPath('paper.pdf');const paperDownload=await download(page,'#builder-download',paper);expect(paperDownload.suggestedFilename()).toBe('OSSの技術論文.pdf');
 const paperText=spawnSync('/usr/bin/pdftotext',[paper,'-'],{encoding:'utf8'});expect(paperText.status).toBe(0);expect(paperText.stderr).toBe('');expect(paperText.stdout).toContain('設計・手法');
 expect(paperText.stdout).toContain('動作テストを実施');expect(paperText.stdout).toContain('github.com');
 await page.locator('#builder-type').selectOption('guide');await expect(page.locator('#builder-doc-title')).toHaveValue('example/oss — ユーザーガイド');
 expect(await page.locator('#builder-section-installation').inputValue()).toContain('npm run my_task');
 await page.locator('#builder-doc-title').fill('OSSユーザーガイド');await page.locator('#builder-author').fill('操作説明者');
 const guide=info.outputPath('guide.pdf');await download(page,'#builder-download',guide);
 const guideText=spawnSync('/usr/bin/pdftotext',[guide,'-'],{encoding:'utf8'});expect(guideText.status).toBe(0);expect(guideText.stderr).toBe('');expect(guideText.stdout).toContain('OSSユーザーガイド');expect(guideText.stdout).toContain('npm run my_task');expect(guideText.stdout).toContain('トラブル対処');
 for(const [name,file] of [['paper',paper],['guide',guide]]){
  const doc=await PDFDocument.load(await fs.readFile(file));expect(doc.getPage(0).getWidth()).toBeCloseTo(595.28,1);
  const raster=spawnSync('/usr/bin/pdftoppm',['-singlefile','-scale-to','1100','-png',file,info.outputPath(name)],{encoding:'utf8'});expect(raster.status).toBe(0);expect(raster.stderr).toBe('');
 }
 await page.screenshot({path:info.outputPath('builder.png')});
 const draftFile=info.outputPath('draft.json');await download(page,'#builder-save-draft',draftFile);const saved=JSON.parse(await fs.readFile(draftFile,'utf8'));expect(saved.drafts.paper.author).toBe('開発者 / 技術部');expect(saved.drafts.guide.author).toBe('操作説明者');
 await page.reload();await page.locator('#open-document-builder').click();await page.locator('#builder-draft-file').setInputFiles(draftFile);await expect(page.locator('#builder-doc-title')).toHaveValue('OSSユーザーガイド');
 await page.locator('#builder-type').selectOption('paper');await expect(page.locator('#builder-doc-title')).toHaveValue('OSSの技術論文');await expect(page.locator('#builder-section-evaluation')).toHaveValue('入力した条件で動作テストを実施した。');
 await page.locator('#builder-add').click();await expect(page.locator('#document-builder')).not.toBeVisible();await expect(page.locator('.card')).not.toHaveCount(0);
 await page.locator('#document-query').fill('OSSの技術論文');await expect(page.locator('.search-result')).not.toHaveCount(0);expect(errors).toEqual([]);
});
test('document builder reports missing GitHub access and rejects broken drafts without losing the manuscript',async({page})=>{
 await page.locator('#files').setInputFiles(await fixture());await expect(page.locator('.card')).toHaveCount(3);
 await page.route('https://api.github.com/repos/example/oss**',r=>r.fulfill({status:403,json:{message:'rate limit'},headers:{'access-control-allow-origin':'*'}}));
 await page.locator('#open-document-builder').click();await page.locator('#builder-repository').fill('https://github.com/example/oss');await page.locator('#builder-import').click();await expect(page.locator('#builder-status')).toContainText('アクセス制限');
 await page.locator('#builder-doc-title').fill('手書きの原稿');await page.locator('#builder-abstract').fill('確認した概要を記入します。');
 await page.locator('#builder-draft-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#builder-status')).toContainText('対応していない');await expect(page.locator('#builder-doc-title')).toHaveValue('手書きの原稿');
 await page.locator('#builder-close').focus();await page.keyboard.press('Control+z');await expect(page.locator('.card')).toHaveCount(3);
 await page.locator('#builder-close').click();await page.locator('#open-document-builder').click();await expect(page.locator('#builder-doc-title')).toHaveValue('手書きの原稿');
});
