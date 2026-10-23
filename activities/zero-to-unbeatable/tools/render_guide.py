"""Render Zero to Unbeatable's canonical HTML guide with ReportLab.

The HTML remains the single source of truth.  ``--check`` performs extraction
and coverage validation without creating a PDF; use it after changing the
guide, then run the default command only when the canonical guide is stable.
"""
from __future__ import annotations

import argparse
import html
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable


@dataclass
class Node:
    tag: str
    attrs: dict[str, str]
    children: list["Node | str"] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())


class GuideHTMLParser(HTMLParser):
    """A deliberately small DOM builder for the guide's semantic HTML."""

    VOID = {"br", "hr", "img", "meta", "link", "input"}
    IGNORED = {"script", "style", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]
        self.ignore_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag.lower(), {key.lower(): value or "" for key, value in attrs})
        self.stack[-1].children.append(node)
        if tag.lower() in self.IGNORED:
            self.ignore_depth += 1
        if tag.lower() not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.IGNORED and self.ignore_depth:
            self.ignore_depth -= 1
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if not self.ignore_depth:
            self.stack[-1].children.append(data)


def descendants(node: Node) -> Iterable[Node]:
    for child in node.children:
        if isinstance(child, Node):
            yield child
            yield from descendants(child)


def first_descendant(node: Node, predicate: Any) -> Node | None:
    return next((child for child in descendants(node) if predicate(child)), None)


def visible_text(value: Node | str, exclude_tags: set[str] | None = None) -> str:
    """Return the human-readable content in document order."""
    excluded = exclude_tags or set()
    if isinstance(value, str):
        return value
    if value.tag in excluded or value.tag in GuideHTMLParser.IGNORED:
        return ""
    return "".join(visible_text(child, excluded) for child in value.children)


def compact(value: str) -> str:
    return " ".join(html.unescape(value).split())


def pdf_safe(value: str) -> str:
    """Use readable ASCII fallbacks for glyphs absent from ReportLab base fonts."""
    value = (value.replace("\u00a0", " ").replace("\u00b7", " - ").replace("\u00d7", " x ")
            .replace("\u2192", " -> ").replace("\u2190", " <- ").replace("\u2013", "-")
            .replace("\u2014", "-").replace("\u2018", "'").replace("\u2019", "'")
            .replace("\u201c", '"').replace("\u201d", '"').replace("\u2026", "...")
            .replace("\u03b5", "epsilon").replace("\u03c3", "sigma").replace("\u00bd", "1/2"))
    superscripts = str.maketrans("\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079", "0123456789")
    return re.sub(r"[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+", lambda match: "^" + match.group().translate(superscripts), value)


def inline_markup(value: Node | str) -> str:
    """Turn the inline subset of guide HTML into ReportLab paragraph markup."""
    if isinstance(value, str):
        return html.escape(pdf_safe(value))
    if value.tag in GuideHTMLParser.IGNORED:
        return ""
    inner = "".join(inline_markup(child) for child in value.children)
    wrappers = {
        "b": ("<b>", "</b>"), "strong": ("<b>", "</b>"),
        "i": ("<i>", "</i>"), "em": ("<i>", "</i>"),
        "code": ('<font name="Courier">', "</font>"),
        "sup": ("<super>", "</super>"), "sub": ("<sub>", "</sub>"),
    }
    if value.tag == "br":
        return "<br/>"
    if value.tag == "a":
        href = html.escape(value.attrs.get("href", ""), quote=True)
        return f'<link href="{href}">{inner}</link>' if href else inner
    if value.tag == "small":
        return f'<br/><font size="8">{inner}</font>'
    opening, closing = wrappers.get(value.tag, ("", ""))
    return opening + inner + closing


@dataclass
class Block:
    kind: str
    node: Node

    @property
    def text(self) -> str:
        return compact(visible_text(self.node))


@dataclass
class Section:
    blocks: list[Block]
    page_break: bool = False


@dataclass
class Guide:
    title: str
    subtitle: str
    eyebrow: str
    header_blocks: list[Block]
    sections: list[Section]
    footer: str
    source_text: str

    def rendered_text(self) -> str:
        parts = [self.eyebrow, self.title, self.subtitle]
        parts.extend(block.text for block in self.header_blocks)
        parts.extend(block.text for section in self.sections for block in section.blocks)
        parts.append(self.footer)
        return compact(" ".join(part for part in parts if part))


def direct_blocks(node: Node, *, in_header: bool = False) -> list[Block]:
    """Extract visual blocks while allowing wrapper divs such as .cols."""
    blocks: list[Block] = []
    for child in node.children:
        if isinstance(child, str):
            if child.strip():
                wrapper = Node("p", {}, [child])
                blocks.append(Block("p", wrapper))
            continue
        if child.tag in GuideHTMLParser.IGNORED:
            continue
        if in_header and "eyebrow" in child.classes:
            # It is rendered separately above the title.
            continue
        if "say" in child.classes:
            blocks.append(Block("say", child))
        elif "note" in child.classes:
            blocks.append(Block("note", child))
        elif child.tag in {"h1", "h2", "h3", "p"}:
            if in_header and child.tag == "h1":
                continue
            blocks.append(Block(child.tag, child))
        elif child.tag in {"ol", "ul"}:
            blocks.append(Block(child.tag, child))
        elif child.tag == "table":
            blocks.append(Block("table", child))
        elif child.tag == "div" and "beat" in child.classes:
            blocks.append(Block("beat", child))
        elif child.tag == "div" and "say" in child.classes:
            blocks.append(Block("say", child))
        elif child.tag == "div" and "mis" in child.classes:
            blocks.append(Block("mis", child))
        elif child.tag in {"div", "article", "main", "aside"}:
            blocks.extend(direct_blocks(child, in_header=in_header))
        else:
            # Inline wrappers at block level are still human-readable content.
            blocks.append(Block("p", child))
    return blocks


def extract(source: Path) -> Guide:
    parser = GuideHTMLParser()
    parser.feed(source.read_text(encoding="utf-8"))
    parser.close()
    guide = first_descendant(parser.root, lambda node: node.tag == "div" and "guide" in node.classes)
    if guide is None:
        raise ValueError("Guide source must contain a <div class=\"guide\"> wrapper.")
    header = first_descendant(guide, lambda node: node.tag == "header")
    footer = first_descendant(guide, lambda node: node.tag == "footer")
    title_node = first_descendant(header, lambda node: node.tag == "h1") if header else None
    if header is None or footer is None or title_node is None:
        raise ValueError("Guide source must contain semantic <header>, <h1>, and <footer> elements.")
    small = first_descendant(title_node, lambda node: node.tag == "small")
    title = compact(visible_text(title_node, {"small"}))
    subtitle = compact(visible_text(small)) if small else ""
    eyebrow_node = first_descendant(header, lambda node: "eyebrow" in node.classes)
    eyebrow = compact(visible_text(eyebrow_node)) if eyebrow_node else ""
    sections = [node for node in descendants(guide) if node.tag == "section"]
    if not sections:
        raise ValueError("Guide source must contain at least one semantic <section>.")
    extracted = Guide(
        title=title,
        subtitle=subtitle,
        eyebrow=eyebrow,
        header_blocks=direct_blocks(header, in_header=True),
        sections=[Section(direct_blocks(section), "page-break" in section.classes) for section in sections],
        footer=compact(visible_text(footer)),
        source_text=compact(visible_text(guide)),
    )
    if not extracted.title or not extracted.footer or any(not section.blocks for section in extracted.sections):
        raise ValueError("Guide has an empty title, footer, or semantic section.")
    validate_extraction(extracted)
    return extracted


def validate_extraction(guide: Guide) -> None:
    """Fail rather than create a PDF if the renderer would omit visible text."""
    rendered = guide.rendered_text()
    # Source HTML can use a <br> or adjacent inline nodes where the PDF needs a
    # space.  Whitespace is layout, not content; every non-whitespace character
    # must still survive in exactly the same order.
    source_content = re.sub(r"\s+", "", guide.source_text)
    rendered_content = re.sub(r"\s+", "", rendered)
    if source_content != rendered_content:
        raise ValueError(
            "Guide extraction would change or omit human-readable content. "
            "Use semantic p/ol/ul/section markup, or extend this renderer first.\n"
            f"source:   {guide.source_text[:300]}\nrendered: {rendered[:300]}"
        )


def table_rows(node: Node) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in (child for child in descendants(node) if child.tag == "tr"):
        cells = [child for child in row.children if isinstance(child, Node) and child.tag in {"td", "th"}]
        rows.append([inline_markup(cell) for cell in cells])
    if not rows or any(len(row) != len(rows[0]) for row in rows):
        raise ValueError("Guide table is malformed.")
    return rows


def reportlab_parts() -> dict[str, Any]:
    """Load ReportLab only when authoring; --check remains dependency-light."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    return locals()


def render(source: Path, destination: Path) -> None:
    guide = extract(source)
    rl = reportlab_parts()
    colors, letter, ParagraphStyle, inch = rl["colors"], rl["letter"], rl["ParagraphStyle"], rl["inch"]
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle = (
        rl["KeepTogether"], rl["PageBreak"], rl["Paragraph"], rl["SimpleDocTemplate"], rl["Spacer"], rl["Table"], rl["TableStyle"]
    )
    navy, gold, ink, muted, line, wash = (colors.HexColor("#002144"), colors.HexColor("#ECAC00"),
        colors.HexColor("#172B42"), colors.HexColor("#526A7E"), colors.HexColor("#B8CAD8"), colors.HexColor("#FFF6D9"))
    styles = {
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=21, leading=23, textColor=navy, spaceAfter=2),
        "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9.2, leading=11.1, textColor=muted, spaceAfter=6),
        "eyebrow": ParagraphStyle("eyebrow", fontName="Helvetica-Bold", fontSize=8.1, leading=9.5, textColor=navy, spaceAfter=3),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.4, leading=12.7, textColor=ink, spaceAfter=4),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.2, leading=14.4, textColor=navy, spaceBefore=7, spaceAfter=3),
        "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.2, leading=12.1, textColor=navy, spaceBefore=5, spaceAfter=2),
        "list": ParagraphStyle("list", fontName="Helvetica", fontSize=10.3, leading=12.4, textColor=ink, leftIndent=15, firstLineIndent=-12, spaceAfter=1),
        "callout": ParagraphStyle("callout", fontName="Helvetica-Oblique", fontSize=10.2, leading=12.4, textColor=ink),
        "beat": ParagraphStyle("beat", fontName="Helvetica", fontSize=10.3, leading=12.4, textColor=ink),
        "time": ParagraphStyle("time", fontName="Helvetica-Bold", fontSize=8.5, leading=10.3, textColor=navy),
        "table_head": ParagraphStyle("table_head", fontName="Helvetica-Bold", fontSize=7.6, leading=8.8, textColor=colors.white),
        "table_cell": ParagraphStyle("table_cell", fontName="Helvetica", fontSize=8.1, leading=9.5, textColor=ink),
    }
    document = SimpleDocTemplate(str(destination), pagesize=letter, leftMargin=.58 * inch, rightMargin=.58 * inch,
        topMargin=.62 * inch, bottomMargin=.57 * inch, title=guide.title, author="Bryant Harrison · Murray State University",
        subject=guide.subtitle or "Printable teaching guide")

    def paragraph(block: Block) -> list[Any]:
        node, kind = block.node, block.kind
        if kind in {"h2", "h3", "p"}:
            return [Paragraph(inline_markup(node), styles["body" if kind == "p" else kind])]
        if kind in {"ol", "ul"}:
            items = [child for child in node.children if isinstance(child, Node) and child.tag == "li"]
            prefix = (lambda index: f"{index}. ") if kind == "ol" else (lambda index: "- ")
            return [Paragraph(prefix(index) + inline_markup(item), styles["list"]) for index, item in enumerate(items, 1)]
        if kind == "say":
            box = Table([[Paragraph(inline_markup(node), styles["callout"])]], colWidths=[document.width])
            box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), wash), ("LINEBEFORE", (0, 0), (0, -1), 3, gold),
                ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
            return [Spacer(1, 1), box, Spacer(1, 3)]
        if kind == "note":
            box = Table([[Paragraph(inline_markup(node), styles["body"])]], colWidths=[document.width])
            box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .45, line), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
            return [Spacer(1, 1), box, Spacer(1, 3)]
        if kind == "mis":
            claim = first_descendant(node, lambda child: "claim" in child.classes)
            answer = first_descendant(node, lambda child: "ans" in child.classes)
            contents = inline_markup(claim) if claim else inline_markup(node)
            if answer:
                contents += "<br/>" + inline_markup(answer)
            box = Table([[Paragraph(contents, styles["body"])]], colWidths=[document.width])
            box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .45, line), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
            return [Spacer(1, 1), box, Spacer(1, 3)]
        if kind == "beat":
            time = first_descendant(node, lambda child: "t" in child.classes)
            time_text = inline_markup(time) if time else ""
            body = inline_markup(node)
            if time:
                body = body.replace(time_text, "", 1)
            beat = Table([[Paragraph(time_text, styles["time"]), Paragraph(body, styles["beat"])]],
                colWidths=[.52 * inch, document.width - .52 * inch])
            beat.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            return [KeepTogether([beat])]
        if kind == "table":
            rows = table_rows(node)
            rendered = [[Paragraph(cell, styles["table_head"] if index == 0 else styles["table_cell"]) for cell in row] for index, row in enumerate(rows)]
            table = Table(rendered, colWidths=[document.width / len(rows[0])] * len(rows[0]), repeatRows=1)
            table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("GRID", (0, 0), (-1, -1), .35, line),
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            return [Spacer(1, 1), table, Spacer(1, 3)]
        raise ValueError(f"Unsupported extracted guide block: {kind}")

    def decorate(canvas: Any, doc: Any) -> None:
        width, height = letter
        canvas.saveState()
        canvas.setFillColor(navy); canvas.rect(0, height - 6, width, 6, fill=1, stroke=0)
        canvas.setFillColor(navy); canvas.setFont("Helvetica-Bold", 8.3); canvas.drawString(doc.leftMargin, height - 23, guide.title)
        canvas.setStrokeColor(gold); canvas.setLineWidth(1.6); canvas.line(doc.leftMargin, height - 28, width - doc.rightMargin, height - 28)
        canvas.setStrokeColor(line); canvas.setLineWidth(.4); canvas.line(doc.leftMargin, 34, width - doc.rightMargin, 34)
        canvas.setFillColor(muted); canvas.setFont("Helvetica", 6.1); canvas.drawString(doc.leftMargin, 22, pdf_safe(guide.footer)[:148])
        canvas.drawRightString(width - doc.rightMargin, 12, f"Page {doc.page}")
        canvas.restoreState()

    story: list[Any] = []
    if guide.eyebrow:
        story.append(Paragraph(pdf_safe(guide.eyebrow), styles["eyebrow"]))
    story.append(Paragraph(pdf_safe(guide.title), styles["title"]))
    if guide.subtitle:
        story.append(Paragraph(pdf_safe(guide.subtitle), styles["subtitle"]))
    for block in guide.header_blocks:
        story.extend(paragraph(block))
    for section_index, section in enumerate(guide.sections):
        if section.page_break and section_index:
            story.append(PageBreak())
        else:
            story.append(Spacer(1, 2))
        block_index = 0
        while block_index < len(section.blocks):
            block = section.blocks[block_index]
            # Keep each section heading with its first content block so a page
            # never ends with a stranded heading.
            if block.kind == "h2" and block_index + 1 < len(section.blocks):
                story.append(KeepTogether(paragraph(block) + paragraph(section.blocks[block_index + 1])))
                block_index += 2
            else:
                story.extend(paragraph(block))
                block_index += 1
    story.extend([Spacer(1, 6), Paragraph(pdf_safe(guide.footer), styles["subtitle"])])
    destination.parent.mkdir(parents=True, exist_ok=True)
    document.build(story, onFirstPage=decorate, onLaterPages=decorate)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--source", type=Path, default=root / "src" / "demo-guide.html")
    arguments.add_argument("--output", type=Path, default=root / "Zero-to-Unbeatable-Demo-Guide.pdf")
    arguments.add_argument("--check", action="store_true", help="validate source extraction without writing a PDF")
    args = arguments.parse_args()
    guide = extract(args.source)
    print(f"Extraction validated: {len(guide.sections)} sections; {len(guide.source_text.split())} visible source words.")
    if not args.check:
        render(args.source, args.output)
        print(f"Rendered {args.output} from canonical {args.source}")


if __name__ == "__main__":
    main()
