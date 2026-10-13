"""Rebuild seeds/sat-math/sat_bank_p7.json from the p7 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p7', 'SAT bank 7')
for m in ['p7_alg', 'p7_adv', 'p7_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p7.json'))
print('wrote', len(b.items), 'items')
