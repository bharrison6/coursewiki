"""Generate the three original SVG teaching figures; no external image inputs."""
from pathlib import Path

BASE = Path(__file__).resolve().parents[2] / 'media' / 'power-transmission'
BASE.mkdir(parents=True, exist_ok=True)

def svg(title, desc, body, width, height):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{title}</title><desc id="desc">{desc}</desc><rect width="{width}" height="{height}" fill="#fff"/>
<style>text{{font-family:Arial,sans-serif;fill:#172b4d;font-size:18px}} .line{{fill:none;stroke:#172b4d;stroke-width:3}} .dim{{fill:none;stroke:#172b4d;stroke-width:1.5;marker-start:url(#a);marker-end:url(#a)}}</style>
<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#172b4d"/></marker></defs>{body}</svg>\n'''

body = '<text x="20" y="30" font-weight="bold">Thread profiles along the screw axis</text>'
profiles = [
    ('Square', 'M15 140H30V85H65V140H100V85H135V140H170V85H205V140', 'Parallel flanks'),
    ('V / machine screw', 'M240 140L270 88H280L310 140L340 88H350L380 140L410 88H420L450 140', 'Angled flanks'),
    ('ACME / trapezoidal', 'M470 140H480L495 85H520L535 140H550L565 85H590L605 140H620L635 85H660L675 140', 'Flat crest, wider root'),
    ('Buttress', 'M695 140V85H710L750 140H765V85H780L820 140H835V85H850L890 140', 'One working direction')]
for index, (name, path, note) in enumerate(profiles):
    x = 20 + index * 225
    body += f'<text x="{x}" y="65" font-weight="bold">{name}</text><path d="{path}" class="line"/><path d="M{x} 160H{x+195}" stroke="#8e9aa8"/><text x="{x}" y="200" font-size="16">{note}</text>'
body += '<path d="M680 110H695" stroke="#172b4d" stroke-width="2" marker-end="url(#a)"/><text x="20" y="248">Schematic only: no manufacturing dimensions or thread angles implied.</text>'
(BASE / 'thread-forms.svg').write_text(svg('Compare thread forms', 'Square, V, trapezoidal and asymmetric buttress profiles side by side.', body, 920, 275), encoding='utf-8')

body = '<text x="20" y="30" font-weight="bold">Unwrap the screw: vertical distance = one turn around its circumference</text>'
for starts, y in [(1, 100), (3, 355)]:
    body += f'<text x="20" y="{y-40}" font-weight="bold">{starts} start' + ('' if starts == 1 else 's') + ' · pitch 2 mm</text>'
    body += f'<rect x="110" y="{y}" width="560" height="120" fill="#f2f5f8" stroke="#7b8798"/><text x="15" y="{y+8}" font-size="14">0 turns</text><text x="15" y="{y+120}" font-size="14">1 turn</text>'
    body += f'<defs><clipPath id="clip{starts}"><rect x="110" y="{y}" width="560" height="120"/></clipPath></defs><g clip-path="url(#clip{starts})">'
    for x in range(-100, 740, 70):
        body += f'<path d="M{x} {y}L{x+70*starts} {y+120}" stroke="#9da9b9" stroke-width="2"/>'
    for j in range(starts):
        x = 180 + j * 70
        color = ['#005a89', '#9c4400', '#684194'][j]
        dash = ['', 'stroke-dasharray="9 4"', 'stroke-dasharray="3 3"'][j]
        body += f'<path d="M{x} {y}L{x+70*starts} {y+120}" fill="none" stroke="{color}" stroke-width="4" {dash}/>'
    body += '</g>'
    for j in range(starts):
        x = 180 + j * 70
        body += f'<text x="{x+8}" y="{y+28}">{chr(65+j)}</text><text x="{x+70*starts+8}" y="{y+110}">{chr(65+j)}</text>'
    body += f'<path d="M180 {y-12}H250" class="dim"/><text x="280" y="{y-7}">pitch = 2 mm</text><path d="M180 {y}V{y+153}" stroke="#172b4d" stroke-dasharray="4 4"/><path d="M180 {y+145}H{180+70*starts}" class="dim"/><text x="{195+70*starts}" y="{y+150}">lead = {2*starts} mm/rev</text>'
body += '<text x="110" y="555">Horizontal distances are along the screw axis →</text>'
(BASE / 'pitch-and-lead.svg').write_text(svg('Pitch versus lead for one and three starts', 'One full wrap advances ridge A by 2 mm with one start and 6 mm with three starts. Adjacent ridges remain 2 mm apart.', body, 760, 580), encoding='utf-8')

body = '<text x="20" y="30" font-weight="bold">Nut fixed · screw rotates and moves · observer at the driving end</text>'
for j, (name, away) in enumerate([('Right-hand', True), ('Left-hand', False)]):
    y = 80 + j * 180
    body += f'<text x="20" y="{y}" font-weight="bold">{name}</text><circle cx="90" cy="{y+62}" r="33" class="line"/><path d="M58 {y+24}A49 49 0 0 1 137 {y+66}" fill="none" stroke="#172b4d" stroke-width="2" marker-end="url(#a)"/><text x="30" y="{y+125}" font-size="16">Clockwise end view</text>'
    body += f'<rect x="265" y="{y+35}" width="360" height="50" fill="#f2f5f8" stroke="#172b4d"/>'
    for x in range(280, 615, 25):
        body += f'<path d="M{x} {y+35}L{x+(18 if away else -18)} {y+85}" stroke="#637895" stroke-width="2"/>'
    body += f'<rect x="470" y="{y+22}" width="60" height="76" fill="#ecac00" stroke="#172b4d"/><text x="465" y="{y+8}">Fixed nut</text><text x="210" y="{y+16}" font-size="14">Observer →</text>'
    body += f'<path d="M{310 if away else 410} {y+115}H{410 if away else 310}" stroke="#172b4d" stroke-width="3" marker-end="url(#a)"/><text x="440" y="{y+122}">' + ('Screw moves away' if away else 'Screw moves toward observer') + '</text>'
body += '<text x="20" y="430">If the screw cannot move axially, the travelling nut moves the opposite way.</text>'
(BASE / 'thread-handedness.svg').write_text(svg('Right-hand and left-hand screw travel', 'Both screws rotate clockwise as viewed by the same observer. With the nut fixed, the right-hand screw advances away; the left-hand screw advances toward the observer.', body, 760, 455), encoding='utf-8')
