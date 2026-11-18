import {PDFDocument,PageSizes,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {DOCUMENT_TYPES} from './oss-documents.js';
import {readFigures} from './document-figures.js';
import {addDocumentOutline} from './document-outline.js';
import {drawDocumentFigures} from './document-figure-pdf.js';
export async function createDocumentPdf(type, draft, fontBytes) {
  const config=Object.hasOwn(DOCUMENT_TYPES,type)?DOCUMENT_TYPES[type]:null;
  if (!config || !draft.title?.trim()) throw new Error('タイトルを入力してください。');
  const figures=readFigures(draft.figures);
  const fields=[draft.title,draft.author||'',draft.abstract||'',draft.references||'',...config.sections.map(([key])=>draft.sections[key]||'')];
  if (fields.some(field=>typeof field!=='string') || fields.join('').length+JSON.stringify(figures).length>80000) throw new Error('原稿は合計8万文字以下にしてください。');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  // Keep standard glyphs so fontkit substitutions cannot lose digits from URLs.
  const font=await pdf.embedFont(fontBytes,{subset:false,features:{locl:false}}),charset=new Set(font.getCharacterSet());
  const clean=text=>Array.from(text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')).map(char=>char==='\n'||char==='\t'||charset.has(char.codePointAt(0))?char:'□').join('').replace(/\t/g,'  ');
  const [width,height]=PageSizes.A4,margin=48,bodyWidth=width-2*margin,gap=22;
  const columns=type==='paper'?2:1,columnWidth=(bodyWidth-gap*(columns-1))/columns;
  const ink=rgb(.12,.16,.19),muted=rgb(.39,.44,.48),accent=rgb(.19,.32,.38);
  let page,y,column=0,firstBodyPage=null,firstBodyTop=0,balanceHeight=null;
  function lines(text,size,maxWidth) {
    const output=[];
    for (const paragraph of clean(text).split('\n')) {
      let line='';
      for(const char of paragraph) {
        if (line && font.widthOfTextAtSize(line+char,size)>maxWidth) {output.push(line);line='';}
        line+=char;
      }
      output.push(line);
    }
    return output;
  }
  function newPage() {
    if (pdf.getPageCount()>=100) throw new Error('原稿が長すぎます。100ページ以下になるよう短くしてください。');
    page=pdf.addPage(PageSizes.A4);column=0;y=height-margin-22;
    page.drawText(config.eyebrow,{x:margin,y:height-margin,size:8,font,color:muted});
    page.drawLine({start:{x:margin,y:height-margin-9},end:{x:width-margin,y:height-margin-9},thickness:.5,color:rgb(.79,.82,.83)});
  }
  function advance(required=16) {
    while(y-required<(page===firstBodyPage&&column===0&&balanceHeight?firstBodyTop-balanceHeight:margin+20)) {
      if(column+1<columns){column++;y=page===firstBodyPage?firstBodyTop:height-margin-22;}else newPage();
    }
  }
  function fullText(text,size,{center=false,color=ink,leading=size*1.55}={}) {
    for (const line of lines(text,size,bodyWidth)) {
      // Cover matter continues on a fresh page if a long abstract requires it.
      if (y-leading<margin+20) {newPage();column=0;}
      const x=center?Math.max(margin,(width-font.widthOfTextAtSize(line,size))/2):margin;
      if(line) page.drawText(line,{x,y,size,font,color});y-=leading;
    }
  }
  const bookmarks=[];
  const bookmark=(title, target=page, top=y+15)=>bookmarks.push({title:clean(title),page:target,top});
  newPage();y-=12;
  bookmark('表題',page,height);
  fullText(draft.title.trim(),type==='paper'?18:24,{center:type==='paper',color:accent});y-=8;
  if(draft.author?.trim()){fullText(draft.author.trim(),10,{center:type==='paper',color:muted});y-=12;}
  if(draft.abstract?.trim()) {
    const label=type==='paper'?'要旨':'このガイドについて';
    if(y-15.5<margin+20)newPage();
    bookmark(label);
    fullText(label,10,{color:accent});y-=3;
    fullText(draft.abstract.trim(),10,{leading:15});y-=12;
    page.drawLine({start:{x:margin,y:y+3},end:{x:width-margin,y:y+3},thickness:.5,color:rgb(.79,.82,.83)});y-=20;
  }
  // Keep both columns below the cover matter on its final page.
  firstBodyPage=page;firstBodyTop=y;
  const sections=[...config.sections.map(([key,label])=>[label,draft.sections[key]||'']),['参考文献・出典',draft.references||'']];
  const estimated=sections.filter(([,raw])=>raw.trim()).reduce((sum,[label,raw])=>sum+lines(label,11,columnWidth).length*18+3+lines(raw.trim(),10,columnWidth).length*15+16,0);
  const available=firstBodyTop-margin-20;
  if(columns===2 && available>100 && estimated<=available*2)balanceHeight=Math.min(available,Math.ceil(estimated/2)+24);
  let section=0;
  for(const [label,raw] of sections) {
    if(!raw.trim()) continue;
    section++;advance(48);
    const x=()=>margin+column*(columnWidth+gap);
    const headingText=`${section}. ${label}`;
    bookmark(headingText);
    for(const heading of lines(headingText,11,columnWidth)) {advance(18);page.drawText(heading,{x:x(),y,size:11,font,color:accent});y-=18;}
    y-=3;
    for(const line of lines(raw.trim(),10,columnWidth)) {
      advance(15);
      if(line)page.drawText(line,{x:x(),y,size:10,font,color:ink});y-=15;
    }
    y-=16;
  }
  drawDocumentFigures(figures,{newPage:()=>{newPage();return page;},bookmark,font,lines,width,height,margin,clean});
  addDocumentOutline(pdf,bookmarks);
  for(const [index,p] of pdf.getPages().entries()) {
    const footer=`${index+1} / ${pdf.getPageCount()}`;
    p.drawText(footer,{x:(width-font.widthOfTextAtSize(footer,8))/2,y:28,font,size:8,color:muted});
  }
  pdf.setTitle(clean(draft.title));if(draft.author)pdf.setAuthor(clean(draft.author));pdf.setSubject(config.label);pdf.setCreator('PDF Studio');
  return pdf.save();
}
