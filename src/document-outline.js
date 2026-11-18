import {PDFHexString, PDFName} from 'pdf-lib';

export function addDocumentOutline(pdf, bookmarks) {
  const {context} = pdf;
  const root = context.nextRef();
  const items = bookmarks.map(() => context.nextRef());

  for (const [index, bookmark] of bookmarks.entries()) {
    const item = context.obj({
      Title: PDFHexString.fromText(bookmark.title),
      Parent: root,
      Dest: [bookmark.page.ref, PDFName.of('XYZ'), null, bookmark.top, null],
    });
    if (index > 0) item.set(PDFName.of('Prev'), items[index - 1]);
    if (index + 1 < items.length) item.set(PDFName.of('Next'), items[index + 1]);
    context.assign(items[index], item);
  }

  context.assign(root, context.obj({
    Type: 'Outlines',
    First: items[0],
    Last: items.at(-1),
    Count: items.length,
  }));
  pdf.catalog.set(PDFName.of('Outlines'), root);
}
