import {rgb} from 'pdf-lib';
export function drawDocumentFigures(figures,{newPage,font,lines,width,height,margin,clean}) {
  const ink=rgb(.12,.16,.19),accent=rgb(.19,.36,.40),muted=rgb(.39,.44,.48),pale=rgb(.94,.97,.97),border=rgb(.72,.80,.82),bodyWidth=width-margin*2;
  for(const [index,figure] of figures.entries()){
    let page,y,bottom,part=0;
    const text=(value,x,baseline,size=10,color=ink)=>page.drawText(clean(value),{x,y:baseline,size,font,color});
    const paragraph=(value,x,size,maxWidth)=>{for(const row of lines(value,size,maxWidth)){if(row)text(row,x,y,size);y-=size*1.5;}};
    const start=()=>{
      page=newPage();part++;y=height-margin-42;
      paragraph(`図${index+1}  ${figure.title}${part>1?'（続き）':''}`,margin,14,bodyWidth);y-=8;
      if(figure.caption){paragraph(figure.caption,margin,10,bodyWidth);y-=12;}
      const source=lines(`出典：${figure.source}`,8.5,bodyWidth);bottom=margin+42+source.length*13;
      source.forEach((row,i)=>text(row,margin,margin+25+(source.length-1-i)*13,8.5,muted));
    };
    start();
    if(figure.kind==='flow'){
      for(const [i,step] of figure.steps.entries()){
        const title=lines(`${i+1}  ${step.title}`,11,bodyWidth-28),detail=step.detail?lines(step.detail,9.5,bodyWidth-28):[];
        const boxHeight=20+title.length*16+detail.length*14;
        if(y-boxHeight<bottom){start();}
        page.drawRectangle({x:margin,y:y-boxHeight,width:bodyWidth,height:boxHeight,color:pale,borderColor:border,borderWidth:.7});
        let baseline=y-20;for(const row of title){text(row,margin+14,baseline,11,accent);baseline-=16;}
        for(const row of detail){text(row,margin+14,baseline,9.5);baseline-=14;}
        y-=boxHeight;
        if(i<figure.steps.length-1){
          if(y-22>=bottom){const x=width/2;page.drawLine({start:{x,y:y-3},end:{x,y:y-17},color:accent,thickness:1});for(const dx of [-4,4])page.drawLine({start:{x,y:y-17},end:{x:x+dx,y:y-12},color:accent,thickness:1});}
          y-=25;
        }
      }
    }else{
      const maximum=Math.max(...figure.bars.map(b=>b.max??b.value))||1,plotWidth=bodyWidth-120;
      const coordinate=v=>margin+v/maximum*plotWidth;
      for(let offset=0;offset<figure.bars.length;offset+=4){
        if(offset)start();
        const group=figure.bars.slice(offset,offset+4),rowHeight=Math.min(88,(y-bottom-78)/group.length);
        for(const [i,bar] of group.entries()){
          const top=y-i*rowHeight;
          lines(bar.label,10,bodyWidth).forEach((row,k)=>text(row,margin,top-k*15,10));
          const by=top-43;
          page.drawRectangle({x:margin,y:by,width:bar.value/maximum*plotWidth,height:14,color:i%2?rgb(.57,.64,.68):accent});
          if(bar.min!==undefined){const mid=by+7;page.drawLine({start:{x:coordinate(bar.min),y:mid},end:{x:coordinate(bar.max),y:mid},color:ink,thickness:1});for(const v of [bar.min,bar.max])page.drawLine({start:{x:coordinate(v),y:mid-5},end:{x:coordinate(v),y:mid+5},color:ink,thickness:1});}
          text(String(bar.value),margin+plotWidth+12,by+3,9);
        }
        const axis=y-group.length*rowHeight+5;
        page.drawLine({start:{x:margin,y:axis},end:{x:margin+plotWidth,y:axis},color:border,thickness:.7});
        for(let i=0;i<=4;i++){
          const label=Number((maximum*i/4).toPrecision(4)).toString(),x=margin+plotWidth*i/4;
          text(label,Math.min(x,width-margin-font.widthOfTextAtSize(label,8)),axis-15,8,muted);
        }
        y=axis-36;if(figure.unit)paragraph(`単位：${figure.unit}`,margin,9,bodyWidth);
        if(figure.bars.some(b=>b.min!==undefined))paragraph('横線：入力された最小〜最大。集計方法はキャプションを参照。',margin,8.5,bodyWidth);
      }
    }
  }
}
