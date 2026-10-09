import sys, io, contextlib, importlib
from sat_author import Batch
mods = sys.argv[1:]
b = Batch('p1', 'SAT bank pilot 1')
for m in mods:
    importlib.import_module(m).add(b)
bad = 0
for it in b.items:
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(it['verify'], {})
    except Exception as e:
        bad += 1
        print('FAIL', it['n'], it['domain'], it['stem'][:60], '|', type(e).__name__, str(e)[:120])
print(len(b.items), 'items,', bad, 'failures')
