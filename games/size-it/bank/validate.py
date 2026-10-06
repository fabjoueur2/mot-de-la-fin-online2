import json, pathlib
r=pathlib.Path(__file__).parent
d=json.loads((r/'bank.json').read_text(encoding='utf-8'))
ids=set()
for x in d['items']:
 assert x['id'] not in ids; ids.add(x['id'])
 assert (r/x['svg']).exists(), x['svg']
 assert x['trueSize']>0
print('OK:',len(ids),'entries; all local SVGs present')
