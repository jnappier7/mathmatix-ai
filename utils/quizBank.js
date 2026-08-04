// utils/quizBank.js — the pop-quiz bank behind /quiz (Facebook ad funnel).
//
// Single source of truth for the viral order-of-operations quizzes: the page
// fetches expressions/options from here (GET, no answers), and grading +
// teaching content is only ever released in the POST /vote response — so the
// correct answer can't be scraped before voting.
//
// Pedagogy note (see memory + tutorConfig): GEMS is the house mnemonic.
// Every `teach` block walks the left-to-right convention and names the
// PEMDAS trap explicitly. `trap` is the answer the trap produces.

const QUIZ_ORDER = ['oops-24', 'oops-6', 'oops-10', 'oops-18'];

const QUIZ_BANK = {
  // The ad problem. 24 ÷ 3(2) − 2 = 14; doing 3(2) first gives 2.
  'oops-24': {
    id: 'oops-24',
    expression: '24 ÷ 3(2) − 2',
    prompt: 'Did you get 14? Or did you get 2?',
    options: ['14', '2'],
    correct: '14',
    trap: '2',
    teach: {
      steps: [
        { math: '3(2)', note: 'Looks like “parentheses first,” right? But the parentheses’ job — grouping — is already done. 3(2) is just 3 × 2.' },
        { math: '24 ÷ 3 = 8', note: 'Division and multiplication are the SAME rank, so you work left to right. Division comes first here.' },
        { math: '8 × 2 = 16', note: 'Now the multiplication.' },
        { math: '16 − 2 = 14', note: 'Subtract last.' },
      ],
      trapNote: 'Got 2? You multiplied 3(2) = 6 first, then 24 ÷ 6 − 2 = 2. That’s the PEMDAS trap: the P makes 3(2) look like a “parentheses” step, and M-before-D makes multiplication look like it outranks division. Neither is a real rule.',
    },
  },

  // Round 2 — the pure M/D left-to-right trap.
  'oops-6': {
    id: 'oops-6',
    expression: '6 ÷ 3 × 2',
    prompt: 'Same trap, fewer distractions.',
    options: ['4', '1'],
    correct: '4',
    trap: '1',
    teach: {
      steps: [
        { math: '6 ÷ 3 = 2', note: 'M and D are equal rank — left to right, division is first in line.' },
        { math: '2 × 2 = 4', note: 'Then multiply.' },
      ],
      trapNote: 'Got 1? You did 3 × 2 = 6 first because M comes before D in PEMDAS. In GEMS they share one letter — M means “multiply and divide, left to right.”',
    },
  },

  // Round 3 — the same trap, addition/subtraction edition.
  'oops-10': {
    id: 'oops-10',
    expression: '10 − 4 + 2',
    prompt: 'The other half of the trap.',
    options: ['8', '4'],
    correct: '8',
    trap: '4',
    teach: {
      steps: [
        { math: '10 − 4 = 6', note: 'Addition and subtraction are equal rank too — left to right, subtraction is first in line.' },
        { math: '6 + 2 = 8', note: 'Then add.' },
      ],
      trapNote: 'Got 4? You added 4 + 2 = 6 first because A comes before S in PEMDAS, then 10 − 6 = 4. Same trap, different letters — GEMS’s S means “subtract and add, left to right.”',
    },
  },

  // Boss round — the internet-famous one. Groups first, then left to right.
  'oops-18': {
    id: 'oops-18',
    expression: '18 ÷ 2(3 + 6)',
    prompt: 'The one that broke the internet.',
    options: ['81', '1'],
    correct: '81',
    trap: '1',
    teach: {
      steps: [
        { math: '3 + 6 = 9', note: 'Groups first — do the INSIDE of the parentheses. That’s the G in GEMS.' },
        { math: '18 ÷ 2 = 9', note: 'Now 2(9) is just 2 × 9 — the grouping job is done. Equal rank, left to right: division first.' },
        { math: '9 × 9 = 81', note: 'Then multiply.' },
      ],
      trapNote: 'Got 1? You kept 2(9) glued together and did 18 ÷ 18. “Parentheses first” only means what’s INSIDE them — once that’s done, it’s ordinary multiplication.',
    },
  },
};

// Every quiz also accepts an 'other' vote ("something else" ad button / honest confusion).
const OTHER_OPTION = 'other';

function getQuiz(quizId) {
  return QUIZ_BANK[quizId] || null;
}

function isValidAnswer(quiz, answer) {
  return quiz.options.includes(answer) || answer === OTHER_OPTION;
}

/** Public (pre-vote) shape — never includes correct/trap/teach. */
function publicQuiz(quiz) {
  return { id: quiz.id, expression: quiz.expression, prompt: quiz.prompt, options: quiz.options };
}

module.exports = { QUIZ_BANK, QUIZ_ORDER, OTHER_OPTION, getQuiz, isValidAnswer, publicQuiz };
