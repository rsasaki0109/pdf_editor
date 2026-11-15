import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const demoRoot=path.resolve('test-results/demo');await fs.mkdir(demoRoot,{recursive:true});
const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
for (let i=0;i<3;i++) {
 const p=pdf.addPage([460,620]);
 p.drawRectangle({x:0,y:0,width:460,height:620,color:rgb(.98,.98,.95)});
 p.drawRectangle({x:30,y:550,width:45,height:5,color:rgb(.4,.56,.32)});
 p.drawText(['PROJECT BRIEF','DESIGN NOTES','NEXT STEPS'][i],{x:30,y:514,size:27,font:bold,color:rgb(.14,.27,.21)});
 p.drawText('A little clarity. A better document.',{x:30,y:480,size:13,font,color:rgb(.5,.55,.45)});
 p.drawText(`STUDIO / 2026                                      0${i+1}`,{x:30,y:35,size:10,font,color:rgb(.5,.55,.45)});
 for(let j=0;j<6;j++)p.drawRectangle({x:30,y:420-j*23,width:j%3===2?220:390,height:5,color:rgb(.85,.88,.81)});
 p.drawRectangle({x:30,y:100,width:390,height:140,color:rgb(.88-i*.025,.92-i*.02,.81)});
 p.drawText(['Make room for ideas.','Keep what matters.','Ready for the next chapter.'][i],{x:48,y:162,size:18,font:bold,color:rgb(.23,.38,.26)});
}
await fs.writeFile(`${demoRoot}/sample.pdf`,await pdf.save());
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1360},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
await page.route('http://localhost:4217/**',async route=>{
 const pathname=new URL(route.request().url()).pathname; const file=path.join(root,'dist',pathname==='/'?'index.html':pathname);
 const ext=path.extname(file); const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.ttf':'font/ttf'};
 try {await route.fulfill({body:await fs.readFile(file),contentType:types[ext]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
});
await page.goto('http://localhost:4217/'); await page.evaluate(()=>document.fonts.ready);
await page.addStyleTag({content:`#status{display:none}body{background:#e9eee1}#app{width:1344px;margin:160px auto 0;box-shadow:0 20px 55px #233d3620;border:1px solid #cdd6c3;border-radius:14px;overflow:hidden;background:#f7f8f5}header{height:65px}main{padding-top:28px}.heading{margin-bottom:22px}h1{font-size:30px}.workspace{min-height:590px}footer{padding:18px 0}.hero-title{position:absolute;left:50px;top:32px;font-size:48px;font-weight:700;letter-spacing:-2px;color:#233d36}.hero-sub{position:absolute;left:53px;top:101px;font-size:16px;color:#77856c}.hero-badge{position:absolute;right:52px;top:65px;border:1px solid #a4b594;padding:10px 18px;border-radius:30px;font-size:13px;color:#45613a}.hero-caption{position:absolute;left:0;bottom:12px;width:100%;text-align:center;font-size:15px;letter-spacing:1px;color:#45613a}#hero-cursor{position:fixed;z-index:10000;width:19px;height:25px;pointer-events:none;filter:drop-shadow(1px 2px 2px #0004)}`});
await page.evaluate(()=>{
 for(const [cls,text] of [['hero-title','PDF Studio'],['hero-sub','PDFを、思いどおりに。'],['hero-badge','LOCAL FIRST  /  ブラウザ内で完結'],['hero-caption','01 / PDFを読み込む']]){const e=document.createElement('div');e.className=cls;e.textContent=text;document.body.append(e);}
 const c=document.createElement('div');c.id='hero-cursor';c.innerHTML='<svg viewBox="0 0 20 26"><path d="M1 1 L1 22 L6 17 L10 25 L14 23 L10 15 L18 15Z" fill="#233d36" stroke="white" stroke-width="1.5"/></svg>';document.body.append(c);
});
let frame=0;
async function snap(){await page.screenshot({path:`${demoRoot}/frame-${String(frame++).padStart(3,'0')}.png`});}
async function hold(n=8){for(let i=0;i<n;i++)await snap();}
async function cursor(selector){const b=await page.locator(selector).first().boundingBox();await page.evaluate(({x,y})=>{const c=document.getElementById('hero-cursor');c.style.left=x+'px';c.style.top=y+'px';},{x:b.x+b.width*.55,y:b.y+b.height*.55});}
async function caption(t){await page.locator('.hero-caption').evaluate((e,t)=>e.textContent=t,t);}
await cursor('.drop .primary');await hold(8);
await page.locator('#files').setInputFiles(`${demoRoot}/sample.pdf`); await page.locator('.card canvas').nth(2).waitFor();await page.waitForTimeout(600);await hold(10);
await caption('02 / ページを、好きな順番に。');await cursor('#right');await hold(3);await page.locator('#right').click();await page.waitForTimeout(300);await hold(10);
await caption('03 / 日本語のテキストも、ひとこと添えて。');await page.locator('#tab-text').click();await page.locator('#text').fill('確認済み');await page.locator('#size').fill('32');await cursor('#addtext');await hold(4);await page.locator('#addtext').click();
const sheet=page.locator('.sheet').nth(1);const b=await sheet.boundingBox();await page.evaluate(({x,y})=>{const c=document.getElementById('hero-cursor');c.style.left=x+'px';c.style.top=y+'px';},{x:b.x+35,y:b.y+b.height*.85});await hold(3);await sheet.click({position:{x:35,y:b.height*.85}});await page.waitForTimeout(400);await hold(12);
await caption('04 / 整えたPDFを、そのまま保存。');await cursor('#save');await hold(3);const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;await download.saveAs(`${demoRoot}/edited.pdf`);await hold(10);
await caption('読み込む。整える。書き出す。すべて、ブラウザで。');await page.locator('#hero-cursor').evaluate(e=>e.style.display='none');await hold(14);
await fs.writeFile(`${demoRoot}/result.json`,JSON.stringify({frames:frame,errors,download:await download.suggestedFilename()},null,2));
await browser.close();
const {execFileSync}=await import('node:child_process');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-framerate','5','-i',`${demoRoot}/frame-%03d.png`,'-filter_complex','fps=5,scale=1080:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0','-y','docs/assets/hero.gif']);
console.log('Updated docs/assets/hero.gif');
