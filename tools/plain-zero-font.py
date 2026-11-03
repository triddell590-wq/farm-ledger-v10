"""Make the body-text copy of Atkinson Hyperlegible Next with a plain (unslashed) zero.
Review A #41: the font's default zero is slashed, which reads like "Ø" in money. The app keeps
the original font (slashed zero) for ear tags only. Run: python3 tools/plain-zero-font.py
Writes app/fonts/atkinson-hyperlegible-next-latin-wght-plainzero.woff2."""
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.ttLib.tables.TupleVariation import TupleVariation
import os
here = os.path.join(os.path.dirname(__file__), "..", "app", "fonts")
src = os.path.join(here, "atkinson-hyperlegible-next-latin-wght-normal.woff2")
out = os.path.join(here, "atkinson-hyperlegible-next-latin-wght-plainzero.woff2")
f = TTFont(src)
glyf = f["glyf"]; gvar = f["gvar"]
z = glyf["zero"]; z.recalcBounds(glyf)
o = glyf["O"]; o.recalcBounds(glyf)
# keep the zero's box: a narrow oval made from the capital O, scaled into the zero's bounds
sx = (z.xMax - z.xMin) / (o.xMax - o.xMin); sy = (z.yMax - z.yMin) / (o.yMax - o.yMin)
c = GlyphComponent(); c.glyphName = "O"
c.x = round(z.xMin - o.xMin * sx); c.y = round(z.yMin - o.yMin * sy)
c.transform = [[sx, 0], [0, sy]]; c.flags = 0
old_vars = gvar.variations.get("zero", [])
g = Glyph(); g.numberOfContours = -1; g.components = [c]
glyf["zero"] = g
# composite deltas: one for the component offset, then the 4 phantom points (advance width varies)
new_vars = []
for v in old_vars:
    ph = v.coordinates[-4:]
    new_vars.append(TupleVariation(v.axes, [(0, 0)] + [p if p is not None else (0, 0) for p in ph]))
gvar.variations["zero"] = new_vars
glyf["zero"].recalcBounds(glyf)
f["maxp"].recalc(f) if hasattr(f["maxp"], "recalc") else None
f.flavor = "woff2"
f.save(out)
print("wrote", out, os.path.getsize(out), "bytes")
