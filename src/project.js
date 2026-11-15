const FORMAT = 'pdf-studio-project';
const VERSION = 1;
export const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
const fail = () => { throw new Error('対応していない形式、または壊れた作業ファイルです。'); };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const rotation = value => [0, 90, 180, 270].includes(value);
function encode(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function saveProject(pages, sources, selected) {
  const activeSources = [...new Set(pages.map(page => page.sourceId))];
  return JSON.stringify({ format: FORMAT, version: VERSION, selected,
    sources: activeSources.map(sourceId => ({ id: sourceId, name: sources.get(sourceId).name, data: encode(sources.get(sourceId).bytes) })),
    pages,
  });
}
export function readProject(json) {
  if (new TextEncoder().encode(json).length > MAX_PROJECT_BYTES) throw new Error('作業ファイルは100MB以下にしてください。');
  let data;
  try { data = JSON.parse(json); } catch { fail(); }
  if (!data || data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.sources) || !Array.isArray(data.pages) || !data.pages.length) fail();
  const sources = new Map(), pageIds = new Set(), textIds = new Set();
  for (const source of data.sources) {
    if (!source || !id(source.id) || sources.has(source.id) || typeof source.name !== 'string' || source.name.length > 4096 || typeof source.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(source.data) || source.data.length % 4 !== 0) fail();
    let bytes;
    try { bytes = Uint8Array.from(atob(source.data), character => character.charCodeAt(0)); } catch { fail(); }
    if (!bytes.length) fail();
    sources.set(source.id, { name: source.name, bytes });
  }
  const pages = data.pages.map(page => {
    if (!page || !id(page.id) || pageIds.has(page.id) || !sources.has(page.sourceId) || !Number.isSafeInteger(page.index) || page.index < 0 || !rotation(page.rotation) || !Array.isArray(page.texts)) fail();
    pageIds.add(page.id);
    return { id: page.id, sourceId: page.sourceId, index: page.index, rotation: page.rotation,
      texts: page.texts.map(text => {
        if (!text || !id(text.id) || textIds.has(text.id) || typeof text.text !== 'string' || !text.text.trim() || !Number.isFinite(text.x) || !Number.isFinite(text.y) || !Number.isFinite(text.size) || text.size < 6 || text.size > 96 || typeof text.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(text.color) || !rotation(text.rotation)) fail();
        textIds.add(text.id);
        return { id: text.id, text: text.text, x: text.x, y: text.y, size: text.size, color: text.color, rotation: text.rotation };
      }),
    };
  });
  if (!pageIds.has(data.selected)) fail();
  return { sources, pages, selected: data.selected };
}
