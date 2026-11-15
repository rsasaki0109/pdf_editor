// Page numbers refer to the current display order, starting at one.
export function parsePageRange(input, pageCount) {
  const value = input.normalize('NFKC').replace(/[、，]/g, ',').replace(/[–—〜～~]/g, '-').trim();
  if (!value) throw new Error('ページ番号を入力してください。例: 1-3, 5');
  const selected = new Set();
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('「1-3, 5」のように番号や範囲をカンマで区切ってください。');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > pageCount || first > pageCount) throw new Error(`ページ番号は1〜${pageCount}の範囲で指定してください。`);
    if (first > last) throw new Error('範囲は小さい番号から指定してください。例: 2-5');
    for (let page = first; page <= last; page++) selected.add(page - 1);
  }
  return [...selected].sort((a,b)=>a-b);
}
