"""Rebuild seeds/sat-math/sat_bank_p2.json from the p2 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p2', 'SAT bank 2')
for m in ['p2_alg', 'p2_adv', 'p2_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p2.json'))
print('wrote', len(b.items), 'items')
