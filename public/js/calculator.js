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
        this.statData = { x: [], y: [] };
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];
        this.historyIndex = -1;
        this.dataEntryMode = false;
        this.currentDataVar = 'x'; // 'x' or 'y'
        this.menuMode = null; // 'STAT', 'DATA', 'STATVAR', null
        this.menuCursor = 0;
        this.statVarMode = false;
        this.statVarIndex = 0;
        this.statVars = ['n', 'x̄', 'Σx', 'Σx²', 'σx', 'ȳ', 'Σy', 'Σy²', 'σy', 'Σxy', 'r', 'a', 'b'];

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
        if (this.dataEntryMode) {
            this.currentInput += num;
            this.updateDisplay();
            return;
        }

        if (this.waitingForOperand) {
            this.currentInput = '';
            this.waitingForOperand = false;
        }
        this.currentInput += num;
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleOperator(op) {
        // Normalize to display characters
        const displayMap = {
            '+': '+',
            '-': '−',
            '−': '−',
            '×': '×',
            '÷': '÷',
            '*': '×',
            '/': '÷'
        };

        const displayOp = displayMap[op] || op;

        if (this.waitingForOperand) {
            // Chain: use previous result to start new expression
            this.currentInput = this.formatNumber(this.lastResult) + displayOp;
            this.waitingForOperand = false;
        } else if (this.currentInput) {
            // Check if last char is already an operator — replace it
            const lastChar = this.currentInput.slice(-1);
            if (['+', '−', '×', '÷'].includes(lastChar)) {
                this.currentInput = this.currentInput.slice(0, -1) + displayOp;
            } else {
                this.currentInput += displayOp;
            }
        }

        this.updateDisplay();
        this.secondFunction = false;
    }

    handleFunction(fn) {
        switch(fn) {
            // Trig functions
            case 'sin':
                this.applyTrigFunction(this.hypMode ? 'sinh' : 'sin');
                break;
            case 'cos':
                this.applyTrigFunction(this.hypMode ? 'cosh' : 'cos');
                break;
            case 'tan':
                this.applyTrigFunction(this.hypMode ? 'tanh' : 'tan');
                break;
            case 'asin':
                this.applyTrigFunction(this.hypMode ? 'asinh' : 'asin');
                break;
            case 'acos':
                this.applyTrigFunction(this.hypMode ? 'acosh' : 'acos');
                break;
            case 'atan':
                this.applyTrigFunction(this.hypMode ? 'atanh' : 'atan');
                break;

            // Logarithms
            case 'log':
                this.applyFunction('log10');
                break;
            case 'pow10':
                this.applyFunction('pow10');
                break;
            case 'ln':
                this.applyFunction('ln');
                break;
            case 'exp':
                this.applyFunction('exp');
                break;

            // Powers and roots
            case 'square':
                this.applyFunction('square');
                break;
            case 'sqrt':
                this.applyFunction('sqrt');
                break;
            case 'power':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + '^';
                    this.waitingForOperand = false;
                } else {
                    this.currentInput += '^';
                }
                this.updateDisplay();
                break;
            case 'nthroot':
                this.currentInput += 'ⁿ√';
                this.updateDisplay();
                break;
            case 'reciprocal':
                this.applyFunction('reciprocal');
                break;

            // Pi
            case 'pi':
                if (this.waitingForOperand) {
                    this.currentInput = '';
                    this.waitingForOperand = false;
                }
                this.currentInput += 'π';
                this.updateDisplay();
                break;

            // HYP mode toggle
            case 'hyp':
                this.hypMode = !this.hypMode;
                this.hypIndicator.textContent = this.hypMode ? 'HYP' : '';
                break;

            // Scientific notation
            case 'ee':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'E';
                    this.waitingForOperand = false;
                } else if (this.currentInput) {
                    this.currentInput += 'E';
                } else {
                    this.currentInput = '1E';
                }
                this.updateDisplay();
                break;

            // Parentheses
            case 'lparen':
                if (this.waitingForOperand) {
                    this.currentInput = '';
                    this.waitingForOperand = false;
                }
                this.currentInput += '(';
                this.updateDisplay();
                break;
            case 'rparen':
                this.currentInput += ')';
                this.updateDisplay();
                break;

            // Probability
            case 'prb':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'nCr';
                    this.waitingForOperand = false;
                } else {
                    this.currentInput += 'nCr';
                }
                this.updateDisplay();
                break;
            case 'nPr':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'nPr';
                    this.waitingForOperand = false;
                } else {
                    this.currentInput += 'nPr';
                }
                this.updateDisplay();
                break;
            case 'prn':
                // Legacy: same as prb
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'nCr';
                    this.waitingForOperand = false;
                } else {
                    this.currentInput += 'nCr';
                }
                this.updateDisplay();
                break;

            // Fractions
            case 'nd':
                this.currentInput += '/';
                this.updateDisplay();
                break;
            case 'abc':
                // Mixed number entry (whole_num unit fraction)
                this.currentInput += '_';
                this.updateDisplay();
                break;
            case 'fd':
                this.toggleFractionDisplay();
                break;
            case 'ud':
            case 'dec':
                this.toggleFractionDisplay();
                break;

            // Factorial
            case 'factorial':
                this.applyFunction('factorial');
                break;

            // Decimal point
            case 'decimal':
                this.handleDecimal();
                break;

            // Negative toggle
            case 'negative':
                this.toggleNegative();
                break;

            // Memory
            case 'sto':
                this.storeMemory();
                break;
            case 'rcl':
                this.recallMemory();
                break;

            // Percent
            case 'percent':
                this.applyFunction('percent');
                break;

            // Comma (for functions with multiple arguments)
            case 'comma':
                this.currentInput += ',';
                this.updateDisplay();
                break;

            // Polar/DMS
            case 'polar':
                // DMS conversion: degrees.minutesseconds → decimal degrees
                this.applyFunction('dms');
                break;

            // Absolute value
            case 'abs':
                this.applyFunction('abs');
                break;
        }

        // Reset second function after use (unless it was 2nd or hyp toggle)
        if (fn !== 'hyp') {
            this.secondFunction = false;
        }
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
                if (this.secondFunction) {
                    this.showStatMenu();
                } else {
                    this.cycleStatMode();
                }
                this.secondFunction = false;
                break;
            case 'data':
                if (this.secondFunction) {
                    this.showDataMenu();
                } else {
                    this.enterDataMode();
                }
                this.secondFunction = false;
                break;
            case 'statvar':
                if (this.secondFunction) {
                    this.exitStatMode();
                } else {
                    this.enterStatVarMode();
                }
                this.secondFunction = false;
                break;
            case 'arrow-up':
                this.handleArrowUp();
                break;
            case 'arrow-down':
                this.handleArrowDown();
                break;
            case 'arrow-left':
                this.handleArrowLeft();
                break;
            case 'arrow-right':
                this.handleArrowRight();
                break;
            case 'del':
                this.deleteLastChar();
                break;
            case 'clear':
                this.clear();
                break;
            case 'enter':
                if (this.menuMode) {
                    this.selectMenuItem();
                } else if (this.dataEntryMode) {
                    this.addDataPoint();
                } else if (this.statVarMode) {
                    this.displayStatVar();
                } else {
                    this.calculate();
                }
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
                if (this.menuMode) {
                    this.selectMenuItem();
                } else if (this.dataEntryMode) {
                    this.addDataPoint();
                } else if (this.statVarMode) {
                    this.displayStatVar();
                } else {
                    this.calculate();
                }
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
                this.handleDecimal();
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
            case '^':
                this.handleFunction('power');
                e.preventDefault();
                break;
            case '!':
                this.handleFunction('factorial');
                e.preventDefault();
                break;
            case 'ArrowUp':
                this.handleArrowUp();
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.handleArrowDown();
                e.preventDefault();
                break;
            case 'ArrowLeft':
                this.handleArrowLeft();
                e.preventDefault();
                break;
            case 'ArrowRight':
                this.handleArrowRight();
                e.preventDefault();
                break;
        }
    }

    // --- Arrow Key Handlers ---

    handleArrowUp() {
        if (this.menuMode === 'STAT') {
            // Navigate stat menu
        } else if (this.history.length > 0) {
            // Scroll through history
            if (this.historyIndex < 0) this.historyIndex = this.history.length;
            this.historyIndex = Math.max(0, this.historyIndex - 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.updateDisplay();
        }
    }

    handleArrowDown() {
        if (this.dataEntryMode) {
            if (this.currentInput) {
                this.addDataPoint();
            }
        } else if (this.historyIndex >= 0) {
            this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.updateDisplay();
        }
    }

    handleArrowLeft() {
        if (this.menuMode === 'STAT') {
            this.menuCursor = 0;
            this.showStatMenu();
        } else if (this.menuMode === 'DATA') {
            this.menuCursor = 0;
            this.showDataMenu();
        } else if (this.statVarMode) {
            this.statVarIndex = Math.max(0, this.statVarIndex - 1);
            this.displayStatVar();
        }
    }

    handleArrowRight() {
        if (this.menuMode === 'STAT') {
            this.menuCursor = 1;
            this.showStatMenu();
        } else if (this.menuMode === 'DATA') {
            this.menuCursor = 1;
            this.showDataMenu();
        } else if (this.statVarMode) {
            const maxIndex = this.statMode === '2-VAR' ? 12 : 4;
            this.statVarIndex = Math.min(maxIndex, this.statVarIndex + 1);
            this.displayStatVar();
        }
    }

    // --- Trig Functions ---

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
            // Hyperbolic functions
            case 'sinh':
                result = Math.sinh(value);
                break;
            case 'cosh':
                result = Math.cosh(value);
                break;
            case 'tanh':
                result = Math.tanh(value);
                break;
            case 'asinh':
                result = Math.asinh(value);
                break;
            case 'acosh':
                result = Math.acosh(value);
                break;
            case 'atanh':
                result = Math.atanh(value);
                break;
        }

        // Reset HYP mode after use
        this.hypMode = false;
        this.hypIndicator.textContent = '';

        this.setResult(result);
    }

    // --- Math Functions ---

    applyFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;

        let result;
        switch(fn) {
            case 'log10':
                if (value <= 0) { this.showError('DOMAIN ERROR'); return; }
                result = Math.log10(value);
                break;
            case 'ln':
                if (value <= 0) { this.showError('DOMAIN ERROR'); return; }
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
                if (value < 0 || !Number.isInteger(value) || value > 170) {
                    this.showError('ERROR');
                    return;
                }
                result = this.factorial(value);
                break;
            case 'percent':
                result = value / 100;
                break;
            case 'sqrt':
                if (value < 0) { this.showError('DOMAIN ERROR'); return; }
                result = Math.sqrt(value);
                break;
            case 'square':
                result = value * value;
                break;
            case 'reciprocal':
                if (value === 0) { this.showError('DIVIDE BY 0'); return; }
                result = 1 / value;
                break;
            case 'dms':
                // Convert DMS notation (DD.MMSSss) to decimal degrees
                result = this.dmsToDecimal(value);
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

    dmsToDecimal(dms) {
        // DMS format: DD.MMSSss
        const degrees = Math.floor(dms);
        const rest = (dms - degrees) * 100;
        const minutes = Math.floor(rest);
        const seconds = (rest - minutes) * 100;
        return degrees + minutes / 60 + seconds / 3600;
    }

    getCurrentValue() {
        if (!this.currentInput) {
            return this.lastResult;
        }
        // Get the last number from the expression
        const parts = this.currentInput.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1].replace(/[)]/g, '');
        if (lastPart === '' || lastPart === 'π') {
            if (lastPart === 'π') return Math.PI;
            return this.lastResult;
        }
        const value = parseFloat(lastPart);
        return isNaN(value) ? this.lastResult : value;
    }

    setResult(value) {
        if (value === undefined || value === null) return;
        this.currentInput = '';
        this.result = value;
        this.lastResult = value;
        this.resultLine.textContent = this.formatNumber(value);
        this.waitingForOperand = true;
        this.updateDisplay();
    }

    // --- Decimal Handling ---

    handleDecimal() {
        if (this.waitingForOperand) {
            this.currentInput = '0.';
            this.waitingForOperand = false;
            this.updateDisplay();
            return;
        }

        // Check only the current number segment for a decimal
        const parts = this.currentInput.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes('.')) {
            this.currentInput += (lastPart === '' ? '0.' : '.');
            this.updateDisplay();
        }
    }

    // --- Negative Toggle ---

    toggleNegative() {
        if (this.waitingForOperand) {
            // Negate the last result
            this.lastResult = -this.lastResult;
            this.result = this.lastResult;
            this.resultLine.textContent = this.formatNumber(this.lastResult);
            return;
        }

        if (this.currentInput) {
            // Find the last number in the expression and negate it
            const match = this.currentInput.match(/(.*?)(\(?\-?)(\d+\.?\d*E?[+\-]?\d*)$/);
            if (match) {
                const prefix = match[1];
                const sign = match[2];
                const num = match[3];
                if (sign === '(-' || sign === '-') {
                    // Remove negation
                    this.currentInput = prefix + num;
                } else {
                    this.currentInput = prefix + '(-' + num + ')';
                }
            } else {
                if (this.currentInput.startsWith('(-')) {
                    this.currentInput = this.currentInput.slice(2, -1);
                } else {
                    this.currentInput = '(-' + this.currentInput + ')';
                }
            }
            this.updateDisplay();
        }
    }

    // --- Angle Mode ---

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.angleModeDisplay.textContent = this.angleMode;
    }

    // --- Fraction Display ---

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
        if (Number.isInteger(decimal)) return decimal.toString();

        const sign = decimal < 0 ? '-' : '';
        decimal = Math.abs(decimal);

        const tolerance = 1.0e-8;
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
        let b = decimal;
        let iterations = 0;

        do {
            let a = Math.floor(b);
            let aux = h1;
            h1 = a * h1 + h2;
            h2 = aux;
            aux = k1;
            k1 = a * k1 + k2;
            k2 = aux;
            if (Math.abs(b - a) < tolerance) break;
            b = 1 / (b - a);
            iterations++;
        } while (Math.abs(decimal - h1 / k1) > decimal * tolerance && iterations < 100);

        if (k1 === 1) {
            return sign + h1.toString();
        }

        // Show as mixed number if > 1
        if (h1 > k1) {
            const whole = Math.floor(h1 / k1);
            const remainder = h1 % k1;
            if (remainder === 0) return sign + whole.toString();
            return `${sign}${whole} ${remainder}/${k1}`;
        }

        return `${sign}${h1}/${k1}`;
    }

    // --- Memory ---

    storeMemory() {
        const value = this.getCurrentValue();
        if (value !== null) {
            this.memory = value;
            this.memoryIndicator.textContent = 'M';
            this.showMessage('STO → M');
        }
    }

    recallMemory() {
        if (this.waitingForOperand) {
            this.currentInput = '';
            this.waitingForOperand = false;
        }
        this.currentInput += this.memory.toString();
        this.updateDisplay();
    }

    // --- Statistics Menu System ---

    showStatMenu() {
        this.menuMode = 'STAT';
        this.menuCursor = this.statMode === '2-VAR' ? 1 : 0;
        const options = ['1-VAR', '2-VAR'];
        this.inputLine.textContent = options.map((opt, i) =>
            i === this.menuCursor ? `▸${opt}` : ` ${opt}`
        ).join('  ');
        this.resultLine.textContent = 'Select mode';
    }

    showDataMenu() {
        this.menuMode = 'DATA';
        this.menuCursor = 0;
        this.inputLine.textContent = '▸CLRDATA';
        this.resultLine.textContent = 'Clear stat data?';
    }

    selectMenuItem() {
        if (this.menuMode === 'STAT') {
            if (this.menuCursor === 0) {
                this.statMode = '1-VAR';
                this.showMessage('1-VAR MODE');
            } else {
                this.statMode = '2-VAR';
                this.showMessage('2-VAR MODE');
            }
            this.menuMode = null;
        } else if (this.menuMode === 'DATA') {
            this.statData = { x: [], y: [] };
            this.showMessage('DATA CLEARED');
            this.menuMode = null;
        }
    }

    cycleStatMode() {
        if (this.statMode === null) {
            this.statMode = '1-VAR';
            this.showMessage('1-VAR MODE');
        } else if (this.statMode === '1-VAR') {
            this.statMode = '2-VAR';
            this.showMessage('2-VAR MODE');
        } else {
            this.statMode = null;
            this.statData = { x: [], y: [] };
            this.showMessage('STAT OFF');
        }
    }

    enterDataMode() {
        if (!this.statMode) {
            this.showMessage('SELECT STAT MODE');
            return;
        }
        this.dataEntryMode = true;
        this.currentInput = '';
        this.currentDataVar = 'x';
        this.showMessage(`DATA ENTRY ${this.statMode}`);
    }

    addDataPoint() {
        if (!this.dataEntryMode) return;

        const value = parseFloat(this.currentInput);
        if (isNaN(value)) {
            this.showError('INVALID DATA');
            return;
        }

        if (this.statMode === '1-VAR') {
            this.statData.x.push(value);
            this.currentInput = '';
            this.showMessage(`n = ${this.statData.x.length}`);
        } else if (this.statMode === '2-VAR') {
            if (this.currentDataVar === 'x') {
                this.statData.x.push(value);
                this.currentDataVar = 'y';
                this.currentInput = '';
                this.showMessage('Enter Y');
            } else {
                this.statData.y.push(value);
                this.currentDataVar = 'x';
                this.currentInput = '';
                this.showMessage(`n = ${this.statData.x.length}`);
            }
        }

        setTimeout(() => {
            if (this.dataEntryMode) {
                this.inputLine.textContent = this.currentInput || '';
                this.resultLine.textContent = this.dataEntryMode ?
                    `${this.statMode} | Enter ${this.currentDataVar.toUpperCase()}` : '0';
            }
        }, 1500);
    }

    enterStatVarMode() {
        if (!this.statMode) {
            this.showMessage('NO STAT MODE');
            return;
        }
        if (this.statData.x.length === 0) {
            this.showMessage('NO DATA');
            return;
        }
        this.statVarMode = true;
        this.statVarIndex = 0;
        this.displayStatVar();
    }

    exitStatMode() {
        this.statMode = null;
        this.statData = { x: [], y: [] };
        this.statVarMode = false;
        this.dataEntryMode = false;
        this.showMessage('STAT OFF');
    }

    displayStatVar() {
        const varName = this.statVars[this.statVarIndex];
        const stats = this.calculateStatistics();

        if (!stats) {
            this.showMessage('NO DATA');
            return;
        }

        let value;
        switch(varName) {
            case 'n':
                value = this.statData.x.length;
                break;
            case 'x̄':
                value = stats.xMean;
                break;
            case 'Σx':
                value = stats.xSum;
                break;
            case 'Σx²':
                value = stats.xSumSq;
                break;
            case 'σx':
                value = stats.xStd;
                break;
            case 'ȳ':
                value = this.statMode === '2-VAR' ? stats.yMean : undefined;
                break;
            case 'Σy':
                value = this.statMode === '2-VAR' ? stats.ySum : undefined;
                break;
            case 'Σy²':
                value = this.statMode === '2-VAR' ? stats.ySumSq : undefined;
                break;
            case 'σy':
                value = this.statMode === '2-VAR' ? stats.yStd : undefined;
                break;
            case 'Σxy':
                value = this.statMode === '2-VAR' ? stats.xySum : undefined;
                break;
            case 'r':
                value = this.statMode === '2-VAR' ? stats.r : undefined;
                break;
            case 'a':
                value = this.statMode === '2-VAR' ? stats.intercept : undefined;
                break;
            case 'b':
                value = this.statMode === '2-VAR' ? stats.slope : undefined;
                break;
        }

        if (value === undefined) {
            this.inputLine.textContent = `${varName} =`;
            this.resultLine.textContent = 'N/A (2-VAR only)';
        } else {
            this.inputLine.textContent = `${varName} =`;
            this.resultLine.textContent = this.formatNumber(value);
            this.lastResult = value;
        }
    }

    calculateStatistics() {
        if (!this.statMode || this.statData.x.length === 0) {
            return null;
        }

        const stats = {};
        const n = this.statData.x.length;
        const xData = this.statData.x;

        const xSum = xData.reduce((a, b) => a + b, 0);
        stats.xSum = xSum;
        stats.xMean = xSum / n;

        const xVariance = xData.reduce((sum, val) => sum + Math.pow(val - stats.xMean, 2), 0) / n;
        stats.xStd = Math.sqrt(xVariance);

        stats.xSumSq = xData.reduce((sum, val) => sum + val * val, 0);

        if (this.statMode === '2-VAR' && this.statData.y.length === n) {
            const yData = this.statData.y;
            const ySum = yData.reduce((a, b) => a + b, 0);
            stats.ySum = ySum;
            stats.yMean = ySum / n;

            const yVariance = yData.reduce((sum, val) => sum + Math.pow(val - stats.yMean, 2), 0) / n;
            stats.yStd = Math.sqrt(yVariance);

            stats.ySumSq = yData.reduce((sum, val) => sum + val * val, 0);

            const xySum = xData.reduce((sum, x, i) => sum + x * yData[i], 0);
            stats.xySum = xySum;

            // Linear regression: y = a + bx
            const slope = (n * xySum - xSum * ySum) / (n * stats.xSumSq - xSum * xSum);
            const intercept = (ySum - slope * xSum) / n;

            stats.slope = slope;
            stats.intercept = intercept;

            // Correlation coefficient
            const corrNumerator = n * xySum - xSum * ySum;
            const corrDenominator = Math.sqrt(
                (n * stats.xSumSq - xSum * xSum) * (n * stats.ySumSq - ySum * ySum)
            );
            stats.r = corrDenominator !== 0 ? corrNumerator / corrDenominator : 0;
        }

        return stats;
    }

    // --- Expression Evaluation ---

    calculate() {
        if (!this.currentInput) return;

        try {
            // Replace display symbols with JavaScript operators
            let expression = this.currentInput
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/−/g, '-')
                .replace(/π/g, `(${Math.PI})`)
                .replace(/\^/g, '**');

            // Handle EE (scientific notation)
            expression = expression.replace(/(\d+\.?\d*)E([+\-]?\d+)/g, '($1*Math.pow(10,$2))');

            // Handle nCr (combinations)
            expression = this.handleCombinations(expression);

            // Handle nPr (permutations)
            expression = this.handlePermutations(expression);

            // Handle square root if present
            expression = this.handleSquareRoot(expression);

            // Handle nth root if present
            expression = this.handleNthRoot(expression);

            // Handle implicit multiplication (e.g., "2(3)" → "2*(3)")
            expression = expression.replace(/(\d)\(/g, '$1*(');
            expression = expression.replace(/\)(\d)/g, ')*$1');
            expression = expression.replace(/\)\(/g, ')*(');

            // Evaluate the expression safely
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
            this.historyIndex = -1;

            this.waitingForOperand = true;

        } catch (error) {
            this.showError('SYNTAX ERROR');
        }
    }

    handleCombinations(expression) {
        const regex = /(\d+\.?\d*)nCr(\d+\.?\d*)/g;
        return expression.replace(regex, (match, n, r) => {
            return this.combination(parseFloat(n), parseFloat(r));
        });
    }

    handlePermutations(expression) {
        const regex = /(\d+\.?\d*)nPr(\d+\.?\d*)/g;
        return expression.replace(regex, (match, n, r) => {
            return this.permutation(parseFloat(n), parseFloat(r));
        });
    }

    combination(n, r) {
        if (n < r || n < 0 || r < 0) return NaN;
        n = Math.round(n);
        r = Math.round(r);
        return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
    }

    permutation(n, r) {
        if (n < r || n < 0 || r < 0) return NaN;
        n = Math.round(n);
        r = Math.round(r);
        return this.factorial(n) / this.factorial(n - r);
    }

    handleSquareRoot(expression) {
        return expression.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)')
                         .replace(/√(\d+\.?\d*)/g, 'Math.sqrt($1)');
    }

    handleNthRoot(expression) {
        return expression.replace(/(\d+\.?\d*)ⁿ√\(([^)]+)\)/g, 'Math.pow($2, 1/$1)')
                         .replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2, 1/$1)');
    }

    safeEval(expression) {
        // Validate: only allow safe characters
        const safePattern = /^[0-9+\-*/.()eE ,Math.powsqrtPI\s]+$/;
        // Remove Math function calls for validation
        const stripped = expression
            .replace(/Math\.(pow|sqrt|PI)/g, '')
            .replace(/\s/g, '');

        // Check for dangerous patterns
        if (/[a-df-oq-zA-DF-OQ-Z_$]/.test(stripped)) {
            throw new Error('Invalid expression');
        }

        try {
            const func = new Function('return ' + expression);
            return func();
        } catch (e) {
            throw new Error('Invalid expression');
        }
    }

    // --- Display ---

    formatNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return 'ERROR';

        if (Math.abs(num) < 1e-10 && num !== 0) {
            return num.toExponential(6);
        }
        if (Math.abs(num) > 9999999999) {
            return num.toExponential(6);
        }

        // Round to avoid floating point errors
        const rounded = Math.round(num * 1e10) / 1e10;
        const str = rounded.toString();

        // Limit display length to 10 digits
        if (str.replace(/[.\-]/g, '').length > 10) {
            return num.toPrecision(10);
        }

        return str;
    }

    showError(message) {
        this.resultLine.textContent = message;
        this.resultLine.classList.add('error');
        setTimeout(() => {
            this.resultLine.classList.remove('error');
            this.resultLine.textContent = '0';
            this.currentInput = '';
            this.waitingForOperand = false;
            this.updateDisplay();
        }, 2000);
    }

    showMessage(message) {
        this.inputLine.textContent = message;
        setTimeout(() => {
            if (!this.dataEntryMode && !this.statVarMode) {
                this.updateDisplay();
            }
        }, 1500);
    }

    deleteLastChar() {
        if (this.currentInput.length > 0) {
            // Handle multi-char tokens (nCr, nPr, ⁿ√, etc.)
            if (this.currentInput.endsWith('nCr')) {
                this.currentInput = this.currentInput.slice(0, -3);
            } else if (this.currentInput.endsWith('nPr')) {
                this.currentInput = this.currentInput.slice(0, -3);
            } else if (this.currentInput.endsWith('ⁿ√')) {
                this.currentInput = this.currentInput.slice(0, -2);
            } else if (this.currentInput.endsWith('(-')) {
                this.currentInput = this.currentInput.slice(0, -2);
            } else {
                this.currentInput = this.currentInput.slice(0, -1);
            }
            this.updateDisplay();
        }
    }

    clear() {
        this.currentInput = '';
        this.waitingForOperand = false;
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
        this.menuMode = null;
        this.statVarMode = false;
        this.resultLine.textContent = '0';
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
        this.fractionMode = false;
        this.statMode = null;
        this.statData = { x: [], y: [] };
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
        this.menuMode = null;
        this.statVarMode = false;
        this.history = [];
        this.historyIndex = -1;
        this.memoryIndicator.textContent = '';
        this.hypIndicator.textContent = '';
        this.angleModeDisplay.textContent = 'DEG';
        this.angleMode = 'DEG';
        this.resultLine.textContent = '0';
        this.updateDisplay();
        this.updateSecondFunctionIndicator();
    }

    updateDisplay() {
        this.inputLine.textContent = this.currentInput || '';
        if (!this.waitingForOperand && !this.currentInput) {
            this.resultLine.textContent = '0';
        }
    }

    updateSecondFunctionIndicator() {
        const btn = document.querySelector('[data-action="2nd"]');
        if (!btn) return;
        if (this.secondFunction) {
            btn.style.background = 'linear-gradient(145deg, #f39c12, #e67e22)';
        } else {
            btn.style.background = 'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
    }
}

// Initialize calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const calculator = new TI30XIIS();
});
