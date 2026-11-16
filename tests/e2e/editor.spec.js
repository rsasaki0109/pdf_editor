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
