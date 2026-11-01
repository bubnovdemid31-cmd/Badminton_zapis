"""Optional artwork source; requires fonttools, not used for app builds."""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'arrow'])
pen = TTGlyphPen(None)
missing = pen.glyph()
pen = TTGlyphPen(None)
points = [(160, 100), (680, 620), (680, 300), (800, 300), (800, 840), (260, 840), (260, 720), (580, 720), (60, 200)]
pen.moveTo(points[0])
for point in points[1:]:
    pen.lineTo(point)
pen.closePath()
fb.setupGlyf({'.notdef': missing, 'arrow': pen.glyph()})
fb.setupHorizontalMetrics({'.notdef': (1000, 0), 'arrow': (1000, 60)})
fb.setupHorizontalHeader(ascent=900, descent=-100)
fb.setupCharacterMap({0x2197: 'arrow'})
fb.setupNameTable({'familyName': 'Club Symbols', 'styleName': 'Regular', 'uniqueFontIdentifier': 'ClubSymbols1', 'fullName': 'Club Symbols Regular', 'psName': 'ClubSymbols-Regular', 'version': 'Version 1.0'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-100, usWinAscent=900, usWinDescent=100)
fb.setupPost()
fb.setupMaxp()
fb.save('public/club-symbols.ttf')
