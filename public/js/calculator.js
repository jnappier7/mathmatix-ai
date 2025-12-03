// TI-30XIIS Calculator Implementation
class TI30XIIS {
    constructor() {
        // Display elements
        this.inputLine = document.getElementById('input-line');
        this.resultLine = document.getElementById('result-line');
        this.angleModeDisplay = document.getElementById('angle-mode');
        this.hypIndicator = document.getElementById('hyp-indicator');
        this.memoryIndicator = document.getElementById('memory-indicator');

        // Calculator state
        this.currentInput = '';
        this.result = 0;
        this.memory = 0;
        this.angleMode = 'DEG'; // 'DEG' or 'RAD'
        this.secondFunction = false;
        this.hypMode = false;
        this.fractionMode = false;
        this.statMode = null; // null, '1-VAR', '2-VAR'
        this.statData = [];
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];

        this.initializeEventListeners();
        this.updateDisplay();
    }

    initializeEventListeners() {
        // Number buttons
        document.querySelectorAll('[data-num]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.handleNumber(btn.dataset.num);
            });
        });

        // Operator buttons
        document.querySelectorAll('[data-op]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.handleOperator(btn.dataset.op);
            });
        });

        // Function buttons
        document.querySelectorAll('[data-fn]').forEach(btn => {
            btn.addEventListener('click', () => {
                const fn = this.secondFunction && btn.dataset.fn2 ? btn.dataset.fn2 : btn.dataset.fn;
                this.handleFunction(fn);
            });
        });

        // Action buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.handleAction(btn.dataset.action);
            });
        });

        // Keyboard support
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    handleNumber(num) {
        if (this.waitingForOperand) {
            this.currentInput = '';
            this.waitingForOperand = false;
        }
        this.currentInput += num;
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleOperator(op) {
        const operators = {
            '+': '+',
            '−': '-',
            '×': '*',
            '÷': '/'
        };

        if (this.currentInput && !this.waitingForOperand) {
            this.currentInput += operators[op];
            this.updateDisplay();
        }
        this.secondFunction = false;
    }

    handleFunction(fn) {
        switch(fn) {
            case 'asin':
            case 'sin':
                this.applyTrigFunction(fn);
                break;
            case 'acos':
            case 'cos':
                this.applyTrigFunction(fn);
                break;
            case 'atan':
            case 'tan':
                this.applyTrigFunction(fn);
                break;
            case 'sinh':
            case 'cosh':
            case 'tanh':
                this.applyHyperbolicFunction(fn);
                break;
            case 'log':
                this.applyFunction('log10');
                break;
            case 'ln':
                this.applyFunction('ln');
                break;
            case 'pow10':
                this.applyFunction('pow10');
                break;
            case 'exp':
                this.applyFunction('exp');
                break;
            case 'square':
                this.applyFunction('square');
                break;
            case 'sqrt':
                this.applyFunction('sqrt');
                break;
            case 'nthroot':
                this.currentInput += 'ⁿ√';
                this.updateDisplay();
                break;
            case 'pi':
                if (this.secondFunction) {
                    this.currentInput += 'π';
                } else {
                    this.currentInput += '^';
                }
                this.updateDisplay();
                break;
            case 'abs':
                this.applyFunction('abs');
                break;
            case 'factorial':
                this.applyFunction('factorial');
                break;
            case 'nd':
                // n/d - fraction input
                this.currentInput += '/';
                this.updateDisplay();
                break;
            case 'dec':
                // Convert fraction to decimal
                this.toggleFractionDisplay();
                break;
            case 'fd':
            case 'ud':
                this.toggleFractionDisplay();
                break;
            case 'prn':
                if (this.secondFunction) {
                    this.currentInput += 'nPr';
                } else {
                    this.currentInput += 'nCr';
                }
                this.updateDisplay();
                break;
            case 'lparen':
                this.currentInput += '(';
                this.updateDisplay();
                break;
            case 'rparen':
                this.currentInput += ')';
                this.updateDisplay();
                break;
            case 'decimal':
                if (!this.currentInput.includes('.')) {
                    this.currentInput += this.currentInput ? '.' : '0.';
                    this.updateDisplay();
                }
                break;
            case 'negative':
                this.toggleNegative();
                break;
            case 'sto':
                if (this.secondFunction) {
                    this.recallMemory();
                } else {
                    this.storeMemory();
                }
                break;
            case 'percent':
                if (this.secondFunction) {
                    this.applyFunction('percent');
                }
                break;
        }
        this.secondFunction = false;
    }

    handleAction(action) {
        switch(action) {
            case '2nd':
                this.secondFunction = !this.secondFunction;
                this.updateSecondFunctionIndicator();
                break;
            case 'mode':
                this.toggleAngleMode();
                break;
            case 'stat':
                this.enterStatMode();
                break;
            case 'data':
                this.enterDataMode();
                break;
            case 'del':
                this.deleteLastChar();
                break;
            case 'clear':
                this.clear();
                break;
            case 'enter':
                this.calculate();
                break;
            case 'on':
                this.reset();
                break;
        }
    }

    handleKeyboard(e) {
        const key = e.key;

        // Numbers
        if (key >= '0' && key <= '9') {
            this.handleNumber(key);
            e.preventDefault();
        }

        // Operators
        const opMap = {
            '+': '+',
            '-': '−',
            '*': '×',
            '/': '÷'
        };
        if (opMap[key]) {
            this.handleOperator(opMap[key]);
            e.preventDefault();
        }

        // Special keys
        switch(key) {
            case 'Enter':
                this.calculate();
                e.preventDefault();
                break;
            case 'Escape':
                this.clear();
                e.preventDefault();
                break;
            case 'Backspace':
                this.deleteLastChar();
                e.preventDefault();
                break;
            case '.':
                this.handleFunction('decimal');
                e.preventDefault();
                break;
            case '(':
                this.handleFunction('lparen');
                e.preventDefault();
                break;
            case ')':
                this.handleFunction('rparen');
                e.preventDefault();
                break;
        }
    }

    applyTrigFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;

        let result;
        const angleInRadians = this.angleMode === 'DEG' ? value * Math.PI / 180 : value;

        switch(fn) {
            case 'sin':
                result = Math.sin(angleInRadians);
                break;
            case 'cos':
                result = Math.cos(angleInRadians);
                break;
            case 'tan':
                result = Math.tan(angleInRadians);
                break;
            case 'asin':
                result = Math.asin(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI;
                break;
            case 'acos':
                result = Math.acos(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI;
                break;
            case 'atan':
                result = Math.atan(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI;
                break;
        }

        this.setResult(result);
    }

    applyHyperbolicFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;

        let result;
        switch(fn) {
            case 'sinh':
                result = Math.sinh(value);
                break;
            case 'cosh':
                result = Math.cosh(value);
                break;
            case 'tanh':
                result = Math.tanh(value);
                break;
        }

        this.setResult(result);
    }

    applyFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;

        let result;
        switch(fn) {
            case 'log10':
                result = Math.log10(value);
                break;
            case 'ln':
                result = Math.log(value);
                break;
            case 'pow10':
                result = Math.pow(10, value);
                break;
            case 'exp':
                result = Math.exp(value);
                break;
            case 'abs':
                result = Math.abs(value);
                break;
            case 'factorial':
                result = this.factorial(value);
                break;
            case 'percent':
                result = value / 100;
                break;
            case 'sqrt':
                result = Math.sqrt(value);
                break;
            case 'square':
                result = value * value;
                break;
        }

        this.setResult(result);
    }

    factorial(n) {
        if (n < 0 || !Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    getCurrentValue() {
        if (!this.currentInput) {
            return this.lastResult;
        }
        const value = parseFloat(this.currentInput);
        return isNaN(value) ? null : value;
    }

    setResult(value) {
        this.currentInput = '';
        this.result = value;
        this.lastResult = value;
        this.resultLine.textContent = this.formatNumber(value);
        this.waitingForOperand = true;
        this.updateDisplay();
    }

    toggleNegative() {
        if (this.currentInput) {
            if (this.currentInput.startsWith('(-')) {
                this.currentInput = this.currentInput.slice(2, -1);
            } else {
                this.currentInput = '(-' + this.currentInput + ')';
            }
            this.updateDisplay();
        }
    }

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.angleModeDisplay.textContent = this.angleMode;
    }

    toggleFractionDisplay() {
        this.fractionMode = !this.fractionMode;
        if (this.fractionMode && this.lastResult) {
            const fraction = this.decimalToFraction(this.lastResult);
            this.resultLine.textContent = fraction;
        } else {
            this.resultLine.textContent = this.formatNumber(this.lastResult);
        }
    }

    decimalToFraction(decimal) {
        const tolerance = 1.0e-6;
        let numerator = 1;
        let denominator = 1;
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
        let b = decimal;

        do {
            let a = Math.floor(b);
            let aux = h1;
            h1 = a * h1 + h2;
            h2 = aux;
            aux = k1;
            k1 = a * k1 + k2;
            k2 = aux;
            b = 1 / (b - a);
        } while (Math.abs(decimal - h1 / k1) > decimal * tolerance);

        if (k1 === 1) {
            return h1.toString();
        }
        return `${h1}/${k1}`;
    }

    storeMemory() {
        const value = this.getCurrentValue();
        if (value !== null) {
            this.memory = value;
            this.memoryIndicator.textContent = 'M';
        }
    }

    recallMemory() {
        this.currentInput = this.memory.toString();
        this.updateDisplay();
    }

    enterStatMode() {
        // Toggle between null, 1-VAR, 2-VAR
        if (this.statMode === null) {
            this.statMode = '1-VAR';
        } else if (this.statMode === '1-VAR') {
            this.statMode = '2-VAR';
        } else {
            this.statMode = null;
        }
        this.updateDisplay();
    }

    enterDataMode() {
        if (this.statMode) {
            const value = this.getCurrentValue();
            if (value !== null) {
                this.statData.push(value);
                this.currentInput = '';
                this.updateDisplay();
            }
        }
    }

    calculate() {
        if (!this.currentInput) return;

        try {
            // Replace special symbols with JavaScript operators
            let expression = this.currentInput
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/−/g, '-')
                .replace(/π/g, Math.PI.toString())
                .replace(/\^/g, '**');

            // Handle nCr (combinations)
            expression = this.handleCombinations(expression);

            // Handle nPr (permutations)
            expression = this.handlePermutations(expression);

            // Handle square root if present
            expression = this.handleSquareRoot(expression);

            // Handle nth root if present
            expression = this.handleNthRoot(expression);

            // Evaluate the expression
            const result = this.safeEval(expression);

            if (isNaN(result) || !isFinite(result)) {
                this.showError('ERROR');
                return;
            }

            this.result = result;
            this.lastResult = result;
            this.resultLine.textContent = this.formatNumber(result);
            this.history.push({
                input: this.currentInput,
                result: result
            });

            this.waitingForOperand = true;

        } catch (error) {
            this.showError('SYNTAX ERROR');
        }
    }

    handleCombinations(expression) {
        // Handle nCr - combinations
        const regex = /(\d+\.?\d*)nCr(\d+\.?\d*)/g;
        return expression.replace(regex, (match, n, r) => {
            return this.combination(parseFloat(n), parseFloat(r));
        });
    }

    handlePermutations(expression) {
        // Handle nPr - permutations
        const regex = /(\d+\.?\d*)nPr(\d+\.?\d*)/g;
        return expression.replace(regex, (match, n, r) => {
            return this.permutation(parseFloat(n), parseFloat(r));
        });
    }

    combination(n, r) {
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
    }

    permutation(n, r) {
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / this.factorial(n - r);
    }

    handleSquareRoot(expression) {
        // Simple square root handling
        return expression.replace(/√(\d+\.?\d*)/g, 'Math.sqrt($1)');
    }

    handleNthRoot(expression) {
        // Handle nth root
        return expression.replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2, 1/$1)');
    }

    safeEval(expression) {
        // Create a safer eval using Function constructor
        // This is still eval-based but restricted
        try {
            const func = new Function('return ' + expression);
            return func();
        } catch (e) {
            throw new Error('Invalid expression');
        }
    }

    formatNumber(num) {
        if (Math.abs(num) < 0.000001 && num !== 0) {
            return num.toExponential(6);
        }
        if (Math.abs(num) > 9999999999) {
            return num.toExponential(6);
        }

        // Round to avoid floating point errors
        const rounded = Math.round(num * 1e10) / 1e10;
        return rounded.toString();
    }

    showError(message) {
        this.resultLine.textContent = message;
        this.resultLine.classList.add('error');
        setTimeout(() => {
            this.resultLine.classList.remove('error');
            this.clear();
        }, 2000);
    }

    deleteLastChar() {
        if (this.currentInput.length > 0) {
            this.currentInput = this.currentInput.slice(0, -1);
            this.updateDisplay();
        }
    }

    clear() {
        this.currentInput = '';
        this.waitingForOperand = false;
        this.updateDisplay();
    }

    reset() {
        this.currentInput = '';
        this.result = 0;
        this.lastResult = 0;
        this.memory = 0;
        this.waitingForOperand = false;
        this.secondFunction = false;
        this.hypMode = false;
        this.statMode = null;
        this.statData = [];
        this.memoryIndicator.textContent = '';
        this.updateDisplay();
    }

    updateDisplay() {
        this.inputLine.textContent = this.currentInput || '';
        if (!this.waitingForOperand && !this.currentInput) {
            this.resultLine.textContent = '0';
        }
    }

    updateSecondFunctionIndicator() {
        // Visual feedback for 2nd function mode could be added here
        if (this.secondFunction) {
            document.querySelector('[data-action="2nd"]').style.background =
                'linear-gradient(145deg, #f39c12, #e67e22)';
        } else {
            document.querySelector('[data-action="2nd"]').style.background =
                'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
    }
}

// Initialize calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const calculator = new TI30XIIS();
});
