"""Rebuild seeds/sat-math/sat_bank_p1.json from the p1 sources.

    /path/to/venv/python seeds/sat-math/authoring/build_p1.py

The JSON is what ships (ingest reads it); these sources are how it was written.
Edit a source, rebuild, then run runcheck.py, mutate.py and scripts/auditSatItems.py.
"""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sat_author import Batch

b = Batch('p1', 'SAT bank pilot 1')
for m in ['p1_alg', 'p1_adv', 'p1_psda_geo']:
    importlib.import_module(m).add(b)
b.dump(os.path.join(HERE, '..', 'sat_bank_p1.json'))
print('wrote', len(b.items), 'items')
