"""Rebuild seeds/sat-math/sat_bank_p3.json from the p3 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p3', 'SAT bank 3')
for m in ['p3_alg', 'p3_adv', 'p3_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p3.json'))
print('wrote', len(b.items), 'items')
