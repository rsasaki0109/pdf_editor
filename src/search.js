export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/gu, '');
}
export function searchSnippet(text, query) {
  const needle=normalizeSearch(query), haystack=normalizeSearch(text);
  if (!needle) return null;
  const index=haystack.indexOf(needle);
  if (index<0) return null;
  const start=Math.max(0,index-12), end=Math.min(haystack.length,index+Math.min(needle.length,80)+32);
  return `${start?'…':''}${haystack.slice(start,end)}${end<haystack.length?'…':''}`;
}
