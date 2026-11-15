export function outputFilename(value, extension, selected = false) {
  let stem = value.trim().replace(/\.(?:pdf|pdfstudio)$/i, '').trim();
  // Keep Japanese names while removing path separators and OS-reserved characters.
  stem = stem.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
  stem = [...stem].slice(0, 100).join('').replace(/[. ]+$/g, '') || 'document';
  if (/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  return `${stem}${selected ? '-selected' : ''}.${extension}`;
}
