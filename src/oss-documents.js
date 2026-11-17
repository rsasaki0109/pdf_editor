export const DOCUMENT_TYPES = {
  paper: { label:'技術論文', eyebrow:'TECHNICAL REPORT', sections:[['background','背景と目的'],['design','設計・手法'],['implementation','実装'],['evaluation','評価・検証'],['discussion','考察・課題']] },
  guide: { label:'ユーザーガイド', eyebrow:'USER GUIDE', sections:[['overview','概要・対象ユーザー'],['installation','導入・セットアップ'],['usage','基本的な使い方'],['features','主な機能'],['troubleshooting','トラブル対処・制約']] },
};
export function parseRepositoryUrl(value) {
  let url;try {url=new URL(value.trim());} catch {throw new Error('GitHubのリポジトリURLを入力してください。');}
  const match=url.pathname.replace(/\/$/,'').match(/^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/);
  if (url.protocol!=='https:' || url.hostname!=='github.com' || url.port || url.username || url.password || !match) throw new Error('https://github.com/owner/repository の形式で指定してください。');
  const owner=match[1],repo=match[2].replace(/\.git$/,'');
  if (!repo || ['.','..'].includes(repo)) throw new Error('リポジトリ名を確認してください。');
  return {owner,repo,url:`https://github.com/${owner}/${repo}`};
}
function plainMarkdown(text) {
  const code=[];
  const prose=text.replace(/```[^\n]*\n([\s\S]*?)```/g,(_,body)=>{code.push(body.trim());return `\u0000${code.length-1}\u0000`;});
  return prose.replace(/^.*(?:badge\.svg|shields\.io).*$/gm,'').replace(/^\s*```[^\n]*$/gm,'')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/<[^>]*>/g,'').replace(/^[ \t]*#{1,6}[ \t]+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/`([^`]+)`/g,'$1')
    .replace(/^\s*[-+*]\s+/gm,'・').replace(/\u0000(\d+)\u0000/g,(_,index)=>code[Number(index)]).replace(/\n{3,}/g,'\n\n').trim();
}

function readmeBlocks(markdown) {
  const blocks=[];let current={heading:'',body:[]},inCode=false;
  for (const line of markdown.replace(/\r\n?/g,'\n').split('\n')) {
    if (/^\s*```/.test(line)) inCode=!inCode;
    const heading=!inCode && line.match(/^#{1,6}\s+(.+)/);
    if (heading) {blocks.push(current);current={heading:heading[1],body:[]};}
    else current.body.push(line);
  }
  blocks.push(current);return blocks.map(block=>({heading:block.heading,text:plainMarkdown(block.body.join('\n'))})).filter(block=>block.text);
}
const rules={
 background:/背景|目的|overview|introduction|about|motivation|概要|はじめに/i,
 design:/設計|手法|architecture|design|approach|method/i,
 implementation:/実装|構成|機能|できること|features|implementation|technology|stack/i,
 evaluation:/評価|検証|テスト|test|benchmark|evaluation|performance/i,
 discussion:/考察|課題|制約|制限|今後|limitations|roadmap|future|todo/i,
 overview:/概要|目的|対象|overview|introduction|about/i,
 installation:/インストール|導入|開発|セットアップ|install|setup|requirements|getting started|build|ビルド/i,
 usage:/使い方|使用方法|usage|quick ?start|how to|操作/i,
 features:/機能|できること|保存|検索|ページ|拡大|features|keyboard|shortcuts/i,
 troubleshooting:/制約|注意|トラブル|faq|troubleshoot|limitations|known issues/i,
};
export function createDrafts(source) {
  const blocks=readmeBlocks(source.readme);
  const intro=blocks.find(block=>!block.heading || !rules.installation.test(block.heading));
  const introText=intro?.text||'',description=source.description||'';
  const abstract=(description&&!introText.startsWith(description.trim())?[description,introText].filter(Boolean).join('\n\n'):introText||description).slice(0,3000);
  return Object.fromEntries(Object.entries(DOCUMENT_TYPES).map(([type,config])=>[type,{
    title:`${source.fullName} — ${config.label}`,author:'',abstract,
    sections:Object.fromEntries(config.sections.map(([key])=>[key,blocks.filter(block=>rules[key].test(block.heading)).map(block=>`${block.heading}\n${block.text}`).join('\n\n').slice(0,12000)])),
    references:`[1] ${source.fullName}\n${source.url}\n\n[2] README\n${source.readmeUrl}`,
  }]));
}
export async function fetchRepository(value, {signal, fetcher=fetch}={}) {
  const repository=parseRepositoryUrl(value),base=`https://api.github.com/repos/${repository.owner}/${repository.repo}`;
  async function get(url) {
    const response=await fetcher(url,{signal,headers:{Accept:'application/vnd.github+json'}});
    if (!response.ok) {
      if (response.status===404) throw new Error('公開リポジトリまたはREADMEが見つかりません。URLを確認してください。');
      if ([403,429].includes(response.status)) throw new Error('GitHubのアクセス制限に達しました。時間をおいて再試行するか、原稿を直接入力してください。');
      throw new Error(`GitHubから読み込めませんでした（${response.status}）。`);
    }
    return response.json();
  }
  const metadata=await get(base),readme=await get(`${base}/readme`);
  if (readme.encoding!=='base64' || typeof readme.content!=='string' || readme.content.length>1500000) throw new Error('READMEを取得できないか、サイズが大きすぎます。原稿を直接入力してください。');
  let text;try {text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(readme.content.replace(/\s/g,'')),char=>char.charCodeAt(0)));} catch {throw new Error('READMEの文字コードを読み取れませんでした。');}
  if (text.length>100000) throw new Error('READMEは10万文字以下にしてください。');
  return {url:repository.url,fullName:typeof metadata.full_name==='string'?metadata.full_name:`${repository.owner}/${repository.repo}`,
    description:typeof metadata.description==='string'?metadata.description:'',readme:text,
    readmeUrl:`${repository.url}/blob/${encodeURIComponent(metadata.default_branch||'HEAD')}/${String(readme.path||'README.md').split('/').map(encodeURIComponent).join('/')}`};
}
