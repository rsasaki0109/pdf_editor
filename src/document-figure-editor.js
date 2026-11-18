import {MAX_FIGURES} from './document-figures.js';
export function setupFigureEditor(container,{changed}) {
  const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
  const field=(parent,label,value,key,{max=160,numeric=false,multiline=false}={})=>{
    const wrapper=el('label',label);wrapper.className='field';const input=el(multiline?'textarea':'input');
    input.dataset.figureField=key;input.setAttribute('aria-label',label);input.value=value??'';
    if(numeric){input.type='number';input.min='0';input.max='1000000000000';input.step='any';}else input.maxLength=max;
    if(multiline)input.rows=2;wrapper.append(input);parent.append(wrapper);return input;
  };
  const button=(parent,label,action)=>{const b=el('button',label);b.type='button';b.onclick=()=>{action();changed();};parent.append(b);return b;};
  function read(){return [...container.children].map(card=>{
    const value=key=>card.querySelector(`[data-figure-field="${key}"]`).value;
    const f={kind:card.dataset.kind,title:value('title'),caption:value('caption'),source:value('source')};
    const rows=[...card.querySelector('.figure-rows').children];
    if(f.kind==='flow')f.steps=rows.map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(input=>[input.dataset.figureField,input.value])));
    else{
      f.unit=value('unit');f.bars=rows.map(row=>{
        const inputs=Object.fromEntries([...row.querySelectorAll('input')].map(input=>[input.dataset.figureField,input.value]));
        const bar={label:inputs.label,value:inputs.value===''?NaN:Number(inputs.value)};
        if(inputs.min!==''||inputs.max!==''){bar.min=inputs.min===''?NaN:Number(inputs.min);bar.max=inputs.max===''?NaN:Number(inputs.max);}return bar;
      });
    }
    return f;
  });}
  function row(parent,kind,item={}){
    const r=el('div');r.className='figure-row';parent.append(r);
    if(kind==='flow'){field(r,'ステップ名',item.title,'title',{max:80});field(r,'説明',item.detail,'detail');}
    else{field(r,'項目名',item.label,'label',{max:80});field(r,'値',item.value,'value',{numeric:true});field(r,'最小（任意）',item.min,'min',{numeric:true});field(r,'最大（任意）',item.max,'max',{numeric:true});}
    button(r,'項目を削除',()=>r.remove());
  }
  function card(f){
    const card=el('section');card.className='figure-card';card.dataset.kind=f.kind;container.append(card);
    const header=el('div');header.className='figure-actions';header.append(el('strong',f.kind==='flow'?'構成図':'横棒グラフ'));card.append(header);
    button(header,'上へ',()=>{if(card.previousElementSibling)container.insertBefore(card,card.previousElementSibling);});
    button(header,'下へ',()=>{if(card.nextElementSibling)container.insertBefore(card.nextElementSibling,card);});button(header,'図を削除',()=>card.remove());
    field(card,'図のタイトル',f.title,'title',{max:120});field(card,'キャプション・測定条件',f.caption,'caption',{max:240,multiline:true});
    field(card,'出典（必須）',f.source,'source',{max:300,multiline:true});if(f.kind==='bar')field(card,'単位',f.unit,'unit',{max:60});
    const rows=el('div');rows.className='figure-rows';card.append(rows);
    for(const item of f.kind==='flow'?f.steps:f.bars)row(rows,f.kind,item);
    button(card,'項目を追加',()=>{if(rows.children.length<8)row(rows,f.kind);});
  }
  return {read,render(figures=[]){container.replaceChildren();figures.forEach(card);},add(kind){if(container.children.length>=MAX_FIGURES)return false;card(kind==='flow'?{kind,title:'処理構成',steps:[{title:'入力'},{title:'出力'}]}:{kind,title:'比較結果',bars:[{label:'項目1',value:0}]});changed();return true;}};
}
