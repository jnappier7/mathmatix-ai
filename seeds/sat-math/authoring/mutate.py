import io, contextlib, importlib, re
from sat_author import Batch
b = Batch('p1', 't')
import sys as _s
for m in (_s.argv[1:] or ['p1_alg', 'p1_adv', 'p1_psda_geo']):
    importlib.import_module(m).add(b)
def runs(code):
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code, {})
        return True
    except Exception:
        return False
caught = missed = 0
for it in b.items:
    v = it['verify']
    if it['type'] == 'mc':
        k = it['answer']
        for wrong in range(4):
            if wrong == k: continue
            mv = re.sub(r'\nK = \d+\n', '\nK = %d\n' % wrong, v)
            if runs(mv): missed += 1; print('MISSED mc', it['n'], it['stem'][:50], 'key->', it['choices'][wrong])
            else: caught += 1
    else:
        mv = v.replace("F = [%r" % it['spr_answer'], "F = [%r" % (str(it['spr_answer']) + '1'), 1)
        assert mv != v
        if runs(mv): missed += 1; print('MISSED spr', it['n'])
        else: caught += 1
print('caught', caught, 'missed', missed)
