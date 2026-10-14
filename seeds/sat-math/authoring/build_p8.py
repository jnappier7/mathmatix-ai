"""Rebuild seeds/sat-math/sat_bank_p8.json from the p8 sources (see build_p1.py)."""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p8', 'SAT bank 8')
for m in ['p8_alg', 'p8_adv', 'p8_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p8.json'))
print('wrote', len(b.items), 'items')
