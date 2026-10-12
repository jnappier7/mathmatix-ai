"""Rebuild seeds/sat-math/sat_bank_p4.json from the p4 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p4', 'SAT bank 4')
for m in ['p4_alg', 'p4_adv', 'p4_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p4.json'))
print('wrote', len(b.items), 'items')
