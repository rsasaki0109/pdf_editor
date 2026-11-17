# Japanese font

`public/fonts/NotoSansJP-Regular.ttf` is a static weight-400 instance of Google's Noto Sans JP variable TrueType font, distributed under the bundled SIL OFL license.

Source: https://github.com/google/fonts/tree/main/ofl/notosansjp

Generated with fontTools 4.61.1:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont('NotoSansJP[wght].ttf')
instantiateVariableFont(font, {'wght': 400}, inplace=True)
font.save('public/fonts/NotoSansJP-Regular.ttf')
```

TrueType outlines avoid the invalid CFF subset font warnings produced by the previous OTF/fontkit combination. Runtime exports embed the full static font to avoid dropped glyphs in fontkit subsets. This adds about 3 MB to PDFs containing added text.

```text
c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f  NotoSansJP[wght].ttf
83a598b965a848965ee3d7544f38ad5d519757cb53a3250053284a001e7b2642  public/fonts/NotoSansJP-Regular.ttf
```

PDF embedding disables the OpenType `locl` substitution to keep standard glyph IDs with Unicode mappings. This prevents digits in Latin repository names and URLs from becoming unmapped localized glyphs during PDF extraction.
