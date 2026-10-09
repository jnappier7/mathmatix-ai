"""Authoring helper for SAT bank batches.

Each item carries a self-contained `verify` snippet: PRELUDE (a parser for the
plain-text/Unicode math in choices) + the author's independent computation of
`ans` + checks. MC: the keyed choice equals ans and NO other choice does. SPR:
the canonical answer and every equivalent agree with ans (decimals to the
precision the grid allows).
"""
import json

PRELUDE = r'''
import sympy as sp, re
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor
_T = standard_transformations + (implicit_multiplication_application, convert_xor)
def P(t):
    s = str(t).strip()
    s = re.sub(r'^\s*(?:[a-zA-Z]\(x\)|y)\s*=\s*', '', s)   # "f(x) = ...", "y = ..." -> the expression
    if '=' in s:                                             # an equation -> lhs - rhs
        l, r = s.split('=', 1)
        return P(l) - P(r)
    s = s.replace('−','-').replace('–','-').replace('·','*').replace('×','*').replace('÷','/')
    s = re.sub(r'√(\d+(?:\.\d+)?|[a-z])', r'sqrt(\1)', s)
    _SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
    s = re.sub('[' + _SUP + ']+', lambda m: '^(' + ''.join(str(_SUP.index(c)) for c in m.group(0)) + ')', s)
    s = s.replace('π','pi').replace('√','sqrt').replace(',','')
    s = s.replace('$','').replace('%','')
    s = re.sub(r'\bpi\b', ' pi ', s)
    return parse_expr(s, local_dict={'x':sp.Symbol('x'),'y':sp.Symbol('y'),'pi':sp.pi,'sqrt':sp.sqrt,'e':sp.E}, transformations=_T)
def EQN(a, b):
    # Two equations agree when one is a nonzero constant multiple of the other.
    a, b = sp.expand(a), sp.expand(b)
    if b == 0: return a == 0
    r = sp.simplify(a / b)
    return r.free_symbols == set() and r != 0
def EQ(a, b, tol=1e-9):
    d = sp.simplify(sp.nsimplify(a) - sp.nsimplify(b)) if not (isinstance(a,(int,float)) and isinstance(b,(int,float))) else a-b
    try:
        return abs(complex(sp.N(d))) < tol
    except TypeError:
        return sp.simplify(d) == 0
'''

LETTERS = 'ABCD'


def _mc_check(choices, key, custom=None):
    head = "\nC = %r\nK = %d\n" % (choices, key)
    if custom is not None:
        return head + custom
    return head + (
        "SAME = (lambda a, b: EQN(a, b)) if any('=' in c.replace('f(x) =','').replace('y =','') for c in C) else (lambda a, b: EQ(a, b))\n"
        "assert SAME(P(C[K]), ans), ('key', C[K], ans)\n"
        "for _i,_c in enumerate(C):\n"
        "    if _i != K: assert not SAME(P(_c), ans), ('distractor equals answer', _c)\n"
    )


def _spr_check(canon, equivs, tol):
    return (
        "\nF = %r\n" % ([canon] + list(equivs)) +
        "for _f in F:\n"
        "    assert EQ(P(_f), ans, %r), ('spr form', _f, ans)\n" % tol
    )


class Batch:
    def __init__(self, batch, title):
        self.batch, self.title, self.items = batch, title, []
        self._rot = 0

    def mc(self, domain, skill, diff, stem, correct, wrong, expl, calc, figure=None, key=None, custom=None):
        """correct: the right choice text; wrong: 3 distractor texts. The key
        letter rotates A-D unless `key` pins it."""
        assert len(wrong) == 3
        k = self._rot % 4 if key is None else LETTERS.index(key)
        self._rot += 1
        choices = list(wrong)
        choices.insert(k, correct)
        self.items.append({
            'n': len(self.items) + 1, 'domain': domain, 'skill': skill, 'difficulty': diff,
            'type': 'mc', 'stem': stem, 'choices': choices, 'answer': k,
            'spr_answer': None, 'equivalents': [], 'answer_any': None,
            'explanation': expl, 'verify': PRELUDE + calc + _mc_check(choices, k, custom),
            'figure': figure,
        })

    def spr(self, domain, skill, diff, stem, canon, equivs, expl, calc, figure=None, tol=1e-9, answer_any=None):
        self.items.append({
            'n': len(self.items) + 1, 'domain': domain, 'skill': skill, 'difficulty': diff,
            'type': 'spr', 'stem': stem, 'choices': None, 'answer': None,
            'spr_answer': canon, 'equivalents': list(equivs), 'answer_any': answer_any,
            'explanation': expl, 'verify': PRELUDE + calc + _spr_check(canon, equivs, tol),
            'figure': figure,
        })

    def dump(self, path):
        json.dump({'batch': self.batch, 'title': self.title, 'items': self.items},
                  open(path, 'w'), indent=2, ensure_ascii=False)
        open(path, 'a').write('\n')
