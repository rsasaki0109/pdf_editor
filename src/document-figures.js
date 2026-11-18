export const MAX_FIGURES=8;
export function readFigures(value=[],{allowIncomplete=false}={}) {
  const fail=()=>{throw new Error('図の内容を確認してください。タイトル・出典、項目数、数値と範囲を確認してください。');};
  const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(!allowIncomplete&&required&&!v.trim()))fail();return allowIncomplete?v:v.trim().replace(/\s+/gu,' ');};
  const number=v=>{if(allowIncomplete&&(v===null||Number.isFinite(v)))return v;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e12)fail();return v;};
  if(!Array.isArray(value)||value.length>MAX_FIGURES)fail();
  return value.map(f=>{
    if(!f||!['flow','bar'].includes(f.kind))fail();
    const result={kind:f.kind,title:text(f.title,120,true),caption:text(f.caption??'',240),source:text(f.source,300,true)};
    if(f.kind==='flow'){
      if(!Array.isArray(f.steps)||(!allowIncomplete&&f.steps.length<2)||f.steps.length>8)fail();
      result.steps=f.steps.map(s=>{if(!s||typeof s!=='object')fail();return {title:text(s.title,80,true),detail:text(s.detail??'',160)};});
    }else{
      result.unit=text(f.unit??'',60);
      if(!Array.isArray(f.bars)||(!allowIncomplete&&!f.bars.length)||f.bars.length>8)fail();
      result.bars=f.bars.map(b=>{
        if(!b||typeof b!=='object')fail();const bar={label:text(b.label,80,true),value:number(b.value)};
        if(b.min!==undefined||b.max!==undefined){bar.min=number(b.min);bar.max=number(b.max);if(!allowIncomplete&&(bar.min>bar.value||bar.max<bar.value))fail();}
        return bar;
      });
    }
    return result;
  });
}
