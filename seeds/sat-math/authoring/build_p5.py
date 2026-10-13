"""Rebuild seeds/sat-math/sat_bank_p5.json from the p5 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p5', 'SAT bank 5')
for m in ['p5_alg', 'p5_adv', 'p5_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p5.json'))
print('wrote', len(b.items), 'items')
