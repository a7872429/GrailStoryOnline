import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'dist' / 'assets'
raw = (ROOT / 'dist' / 'card-data.js').read_text(encoding='utf-8')
data = json.loads(raw.removeprefix('window.GAME_DATA=').removesuffix(';\n'))

KEY_SYMBOL = {
    '八想流':'八','弓神候補':'弓','歧路姊妹':'歧','神之子':'子','巫女機關':'機',
    '青梅竹馬':'梅','角鬥場':'鬥','特經社':'特','獵人':'獵','獵物':'物',
    '聖庭武裝':'庭','獸耳同盟':'獸','精靈同盟':'盟','懲戒部隊':'懲','學院都市':'院',
    '神霾之下':'霾','探索旅':'探','幕後策首':'幕','繼承者':'承','單相思':'思',
    '學術交流':'術','魔裝少女':'魔','星徽章':'星'
}
EVENT_SYMBOL = {
    '女武神計畫':'女','御神之亂':'御','劍意末路':'劍','神子創臨':'神','賢者之書':'賢',
    '圓桌統合':'圓','黑衣聖教':'黑','精靈解放':'精','巫女暴走':'巫','紅蓮叛亂':'紅'
}
KEY_COLORS = ['#ffb703','#fb8500','#ef476f','#d65db1','#9b5de5','#6c63ff','#3a86ff','#00b4d8',
              '#00c2a8','#2dc653','#80b918','#aacc00','#ffd166','#f9844a','#f94144','#e76f51',
              '#b56576','#7b2cbf','#4361ee','#118ab2','#06d6a0','#55a630','#f72585']
EVENT_COLORS = ['#264653','#2a9d8f','#457b9d','#5a189a','#7f5539','#bc6c25','#343a40','#588157','#c1121f','#d00000']
FACTION_ACCENT = {'技':'#22c55e','聖':'#4f8cff'}
OLD_ACCENT = {'技':'#34d399','聖':'#38bdf8'}

for card in data['cards']:
    path = ASSETS / f"new-card-{card['id']:02}.svg"
    svg = path.read_text(encoding='utf-8')
    if card['faction'] in FACTION_ACCENT:
        svg = svg.replace(OLD_ACCENT[card['faction']], FACTION_ACCENT[card['faction']])
    marker = re.search(r'<rect x="132" y="710" width="486" height="4" rx="2"[^>]*/>', svg)
    if not marker:
        raise RuntimeError(f'card divider not found: {path.name}')
    prefix = svg[:marker.end()]
    badges = [(KEY_SYMBOL[k], KEY_COLORS[list(KEY_SYMBOL).index(k)], 'square') for k in card['keywords']]
    if card['event']:
        name = card['event']
        badges.append((EVENT_SYMBOL[name], EVENT_COLORS[list(EVENT_SYMBOL).index(name)], 'circle'))
    # Use the whole lower panel: fewer badges become substantially larger,
    # while four badges still span most of the card width without crowding.
    size, gap = {
        1: (220, 0),
        2: (190, 34),
        3: (166, 26),
        4: (144, 20),
    }[len(badges)]
    badge_y = 750
    font_size = round(size * 0.57)
    total = len(badges) * size + max(0, len(badges)-1) * gap
    x = (750-total)/2
    parts = ['<g class="badges">']
    for symbol, color, shape in badges:
        cx, cy = x + size/2, badge_y + size/2
        if shape == 'square':
            parts.append(f'<rect x="{x:.0f}" y="{badge_y}" width="{size}" height="{size}" rx="{size * .16:.0f}" fill="{color}" stroke="#fff" stroke-opacity=".78" stroke-width="5"/>')
        else:
            parts.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{size/2:.0f}" fill="{color}" stroke="#fff" stroke-opacity=".86" stroke-width="5"/>')
        parts.append(f'<text x="{cx:.0f}" y="{cy + font_size * .34:.0f}" class="tag" style="font-size:{font_size}px;font-weight:900;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:4px">{symbol}</text>')
        x += size + gap
    parts.append('</g></svg>')
    path.write_text(prefix + ''.join(parts), encoding='utf-8')

print(f"rebuilt {len(data['cards'])} card badges")
