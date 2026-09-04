import json
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/workspace/scratch/ca7e9922c590/upload/角色條件_已分欄(3).xlsx')
ORDER = ['吟遊詩人','冒險家','封印師','記錄者','異教徒','陰陽師','結界師','瘟疫法師','靈魂術士','魔劍士','魔槍','魔弓','狂戰士','血色劍靈','血之巫女','仲裁者','神箭手','女僕長','鑄律者','蒼炎魔女','紅蓮騎士','染污者','噬神者','勇者','獵巫人','劍之魔女','風之劍聖','劍帝','精靈射手','暗殺者','游擊士','格鬥家','神秘學者','英靈人形','祈禱師','矜貴之女','星墜女巫','咒符師','元素師','獸靈武士','月之女神','守護天使','女武神','靈符師','魔法少女','戰鬥法師','賢者','蝶舞者','聖槍騎士','聖庭檢察士','聖女','神官','聖殿騎士','聖弓','傳教士','紅衣主教']
EVENT_ORDER = ['女武神計劃','禦神之亂','劍意末路','神子創臨','賢者之書','圓桌統合','黑衣聖教','精靈解放','巫女暴走','紅蓮叛亂']

def clean(v):
    if pd.isna(v): return ''
    return str(v).strip().replace('圣','聖').replace('咏','詠').replace('计划','計畫').replace('計劃','計畫').replace('禦神','御神').replace('星星徽章','星徽章').replace('聖廷武裝','聖庭武裝').replace('圆','圓').replace('贤','賢').replace('精灵','精靈').replace('游击','游擊').replace('兽','獸').replace('横置','橫置').replace('场','場').replace('张','張').replace('个','個').replace('弃','棄').replace('进','進').replace('时','時').replace('点','點').replace('数','數').replace('发','發').replace('选','選').replace('将','將').replace('这','這').replace('斗場','鬥場')

raw = pd.read_excel(SOURCE, sheet_name='角色', header=0)
cols = list(raw.columns)
rows = {}
for _, r in raw.iterrows():
    name = clean(r.iloc[0])
    if not name: continue
    rows[name] = {
        'name': name, 'faction': clean(r.iloc[1]), 'event': clean(r.iloc[2]),
        'keywords': [x for x in map(clean, [r.iloc[3],r.iloc[4],r.iloc[5]]) if x],
        'entry': {'costs':[x for x in map(clean,[r.iloc[6],r.iloc[7]]) if x], 'effect':clean(r.iloc[8]), 'extraCondition':clean(r.iloc[9]), 'extraEffect':clean(r.iloc[10])},
        'activate': {'cost':clean(r.iloc[11]), 'effect':clean(r.iloc[12]), 'extraCondition':clean(r.iloc[13]), 'extraEffect':clean(r.iloc[14])}
    }

# 使用者後續補正（2026-09-03）
rows['陰陽師']['entry']['effect'] = '橫置自身與敵方區合計1角色，你黑骰+1'
rows['陰陽師']['entry']['extraCondition'] = ''
rows['陰陽師']['entry']['extraEffect'] = ''

cards=[]
for i,name in enumerate(ORDER,1):
    c=rows[clean(name)]; c['id']=i; cards.append(c)

raw2=pd.read_excel(SOURCE,sheet_name='事件，關鍵字效果',header=0)
keywords={}
events_by_name={}
for _,r in raw2.iterrows():
    k=clean(r.iloc[0])
    if k: keywords[k]={'condition':clean(r.iloc[1]),'effect':clean(r.iloc[2]),'extraCondition':clean(r.iloc[3]),'extraEffect':clean(r.iloc[4])}
    n=clean(r.iloc[6])
    if n: events_by_name[n]={'name':n,'enter':clean(r.iloc[7]),'ongoing':clean(r.iloc[8]),'leave':clean(r.iloc[9])}
events=[]
for i,n in enumerate(EVENT_ORDER,1):
    e=events_by_name[clean(n)]; e['id']=i
    e['participants']=[c['id'] for c in cards if c['event']==e['name']]
    events.append(e)

out='window.GAME_DATA='+json.dumps({'cards':cards,'keywords':keywords,'events':events},ensure_ascii=False,separators=(',',':'))+';\n'
(ROOT/'dist'/'card-data.js').write_text(out,encoding='utf-8')
print(f'wrote {len(cards)} cards, {len(keywords)} keywords, {len(events)} events')
