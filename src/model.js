import { PDFDocument, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
export function movePage(pages, index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= pages.length) return pages;
  const next = [...pages];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
// Copies keep their source PDF, while page and annotation identities stay independent.
export function duplicatePages(pages, ids) {
  const copies = [], output = [];
  for (const page of pages) {
    output.push(page);
    if (!ids.has(page.id)) continue;
    const copy = structuredClone(page);
    copy.id = crypto.randomUUID();
    copy.texts = copy.texts.map(text => ({ ...text, id: crypto.randomUUID() }));
    copies.push(copy); output.push(copy);
  }
  return { pages: output, copies };
}
export async function exportPdf(pages, sources, fontBytes) {
  if (!pages.length) throw new Error('ページを追加してください。');
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const font = pages.some(p => p.texts.length) ? await output.embedFont(fontBytes, { subset: false }) : null;
  const loaded = new Map();
  for (const item of pages) {
    if (!loaded.has(item.sourceId)) loaded.set(item.sourceId, await PDFDocument.load(sources.get(item.sourceId).bytes));
    const [page] = await output.copyPages(loaded.get(item.sourceId), [item.index]);
    page.setRotation(degrees(item.rotation));
    for (const t of item.texts) {
      const hex = t.color.slice(1);
      page.drawText(t.text, { x: t.x, y: t.y, size: t.size, font, rotate: degrees(t.rotation ?? item.rotation), color: rgb(...[0,2,4].map(i => parseInt(hex.slice(i,i+2),16)/255)) });
    }
    output.addPage(page);
  }
  return output.save();
}
