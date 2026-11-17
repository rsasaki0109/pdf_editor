export function pageNumberToIndex(value, count) {
  const number=value.normalize('NFKC').trim();
  if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number)<1 || Number(number)>count) {
    throw new Error(`1〜${count}のページ番号を入力してください。`);
  }
  return Number(number)-1;
}
export function movePageTo(pages, from, to) {
  if (![from,to].every(index=>Number.isInteger(index)&&index>=0&&index<pages.length)) throw new Error('移動するページが見つかりません。');
  if (from===to) return pages;
  const result=[...pages], [page]=result.splice(from,1);
  result.splice(to,0,page);
  return result;
}
