"""Rebuild seeds/sat-math/sat_bank_p6.json from the p6 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p6', 'SAT bank 6')
for m in ['p6_alg', 'p6_adv', 'p6_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p6.json'))
print('wrote', len(b.items), 'items')
