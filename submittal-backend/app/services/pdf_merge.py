"""Local PDF generation/merging — replaces PDF.co entirely.

The index page reproduces the n8n HTML template's look: centered maroon
"INDEX" heading (#7C0000, Playfair Display) and a roman-numeral list in
#1C1C1C (Roboto Flex). Drop the TTFs into app/assets/fonts/ to get the exact
faces; otherwise we fall back to the closest built-in serif/sans.
"""
import io
import logging
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

logger = logging.getLogger("submittal.pdf")

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

HEADING_COLOR = HexColor("#7C0000")
BODY_COLOR = HexColor("#1C1C1C")

_ROMAN_MAP = [
    ("M", 1000), ("CM", 900), ("D", 500), ("CD", 400), ("C", 100), ("XC", 90),
    ("L", 50), ("XL", 40), ("X", 10), ("IX", 9), ("V", 5), ("IV", 4), ("I", 1),
]


def roman(n: int) -> str:
    out, x = "", n
    for symbol, value in _ROMAN_MAP:
        while x >= value:
            out += symbol
            x -= value
    return out


def _register_font(name: str, filenames: list[str], fallback: str) -> str:
    for fn in filenames:
        path = FONTS_DIR / fn
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(name, str(path)))
                return name
            except Exception:  # noqa: BLE001 - bad font file, use fallback
                logger.warning("Could not register font %s, falling back to %s", path, fallback)
    return fallback


def build_index_pdf(index_items: list[dict]) -> bytes:
    """Render the roman-numeral index list to PDF bytes."""
    heading_font = _register_font(
        "PlayfairDisplay",
        ["PlayfairDisplay-Regular.ttf", "PlayfairDisplay.ttf"],
        "Times-Roman",
    )
    body_font = _register_font(
        "RobotoFlex",
        ["RobotoFlex-Regular.ttf", "RobotoFlex.ttf"],
        "Helvetica",
    )

    buf = io.BytesIO()
    page_w, page_h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    margin = 68  # ~90px CSS padding at 96dpi, in points

    # Heading: 36pt, centered, generous top offset like the HTML template
    c.setFillColor(HEADING_COLOR)
    c.setFont(heading_font, 36)
    heading_y = page_h - margin - 70
    c.drawCentredString(page_w / 2, heading_y, "INDEX")

    # Rows: 11pt, roman numeral column then label
    c.setFillColor(BODY_COLOR)
    y = heading_y - 80
    num_x = margin
    label_x = margin + 50
    line_height = 26  # 11pt text + 11px-ish row padding
    for i, item in enumerate(index_items):
        if y < margin:
            c.showPage()
            y = page_h - margin
        c.setFont(body_font, 11)
        c.drawString(num_x, y, f"{roman(i + 1)}.")
        c.drawString(label_x, y, str(item.get("label") or ""))
        y -= line_height

    c.showPage()
    c.save()
    return buf.getvalue()


def merge_pdfs(pdf_streams: list[bytes]) -> bytes:
    writer = PdfWriter()
    for data in pdf_streams:
        reader = PdfReader(io.BytesIO(data))
        for page in reader.pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
