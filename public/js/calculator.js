// TI-30XS MultiView Calculator Implementation
class TI30XSMultiView {
    constructor() {
        // Display elements
        this.inputLine = document.getElementById('input-line');
        this.resultLine = document.getElementById('result-line');
        this.historyDisplay = document.getElementById('display-history');
        this.angleModeDisplay = document.getElementById('angle-mode');
        this.hypIndicator = document.getElementById('hyp-indicator');
        this.memoryIndicator = document.getElementById('memory-indicator');
        this.secondIndicator = document.getElementById('2nd-indicator');

        // Calculator state
        this.currentInput = '';
        this.result = 0;
        this.memory = 0;
        this.angleMode = 'DEG';
        this.secondFunction = false;
        this.hypMode = false;
        this.fractionMode = false;
        this.statMode = null;
        this.statData = { x: [], y: [] };
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];
        this.historyIndex = -1;
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
        this.menuMode = null;
        this.menuCursor = 0;
        this.statVarMode = false;
        this.statVarIndex = 0;
        this.statVars = ['n', 'x̄', 'Σx', 'Σx²', 'σx', 'ȳ', 'Σy', 'Σy²', 'σy', 'Σxy', 'r', 'a', 'b'];

        this.initializeEventListeners();
        this.updateDisplay();
    }

    initializeEventListeners() {
        document.querySelectorAll('[data-num]').forEach(btn => {
            btn.addEventListener('click', () => this.handleNumber(btn.dataset.num));
        });
        document.querySelectorAll('[data-op]').forEach(btn => {
            btn.addEventListener('click', () => this.handleOperator(btn.dataset.op));
        });
        document.querySelectorAll('[data-fn]').forEach(btn => {
            btn.addEventListener('click', () => {
                const fn = this.secondFunction && btn.dataset.fn2 ? btn.dataset.fn2 : btn.dataset.fn;
                this.handleFunction(fn);
            });
        });
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
        });
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // --- Input Handlers ---

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
        const displayMap = {
            '+': '+', '-': '−', '−': '−',
            '×': '×', '÷': '÷', '*': '×', '/': '÷'
        };
        const displayOp = displayMap[op] || op;

        if (this.waitingForOperand) {
            // Chain from previous result
            this.currentInput = this.formatNumber(this.lastResult) + displayOp;
            this.waitingForOperand = false;
        } else if (this.currentInput) {
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
            case 'sin': this.applyTrigFunction(this.hypMode ? 'sinh' : 'sin'); break;
            case 'cos': this.applyTrigFunction(this.hypMode ? 'cosh' : 'cos'); break;
            case 'tan': this.applyTrigFunction(this.hypMode ? 'tanh' : 'tan'); break;
            case 'asin': this.applyTrigFunction(this.hypMode ? 'asinh' : 'asin'); break;
            case 'acos': this.applyTrigFunction(this.hypMode ? 'acosh' : 'acos'); break;
            case 'atan': this.applyTrigFunction(this.hypMode ? 'atanh' : 'atan'); break;
            case 'log': this.applyFunction('log10'); break;
            case 'pow10': this.applyFunction('pow10'); break;
            case 'ln': this.applyFunction('ln'); break;
            case 'exp': this.applyFunction('exp'); break;
            case 'square': this.applyFunction('square'); break;
            case 'sqrt': this.applyFunction('sqrt'); break;
            case 'power':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + '^';
                    this.waitingForOperand = false;
                } else { this.currentInput += '^'; }
                this.updateDisplay(); break;
            case 'nthroot':
                this.currentInput += 'ⁿ√';
                this.updateDisplay(); break;
            case 'reciprocal': this.applyFunction('reciprocal'); break;
            case 'pi':
                if (this.waitingForOperand) { this.currentInput = ''; this.waitingForOperand = false; }
                this.currentInput += 'π';
                this.updateDisplay(); break;
            case 'hyp':
                this.hypMode = !this.hypMode;
                this.hypIndicator.textContent = this.hypMode ? 'HYP' : '';
                break;
            case 'ee':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'E';
                    this.waitingForOperand = false;
                } else if (this.currentInput) { this.currentInput += 'E'; }
                else { this.currentInput = '1E'; }
                this.updateDisplay(); break;
            case 'lparen':
                if (this.waitingForOperand) { this.currentInput = ''; this.waitingForOperand = false; }
                this.currentInput += '(';
                this.updateDisplay(); break;
            case 'rparen':
                this.currentInput += ')';
                this.updateDisplay(); break;
            case 'prb': case 'prn':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'nCr';
                    this.waitingForOperand = false;
                } else { this.currentInput += 'nCr'; }
                this.updateDisplay(); break;
            case 'nPr':
                if (this.waitingForOperand) {
                    this.currentInput = this.formatNumber(this.lastResult) + 'nPr';
                    this.waitingForOperand = false;
                } else { this.currentInput += 'nPr'; }
                this.updateDisplay(); break;
            case 'nd':
                this.currentInput += '▸n/d◂';
                this.updateDisplay(); break;
            case 'abc':
                this.currentInput += '_';
                this.updateDisplay(); break;
            case 'fd': case 'ud': case 'dec': case 'toggle':
                this.toggleFractionDisplay(); break;
            case 'factorial': this.applyFunction('factorial'); break;
            case 'decimal': this.handleDecimal(); break;
            case 'negative': this.toggleNegative(); break;
            case 'sto': this.storeMemory(); break;
            case 'rcl': this.recallMemory(); break;
            case 'percent': this.applyFunction('percent'); break;
            case 'comma':
                this.currentInput += ',';
                this.updateDisplay(); break;
            case 'polar': this.applyFunction('dms'); break;
            case 'abs': this.applyFunction('abs'); break;
        }
        if (fn !== 'hyp') this.secondFunction = false;
    }

    handleAction(action) {
        switch(action) {
            case '2nd':
                this.secondFunction = !this.secondFunction;
                this.updateSecondFunctionIndicator(); break;
            case 'mode': this.toggleAngleMode(); break;
            case 'stat':
                if (this.secondFunction) this.showStatMenu();
                else this.cycleStatMode();
                this.secondFunction = false; break;
            case 'data':
                if (this.secondFunction) this.showDataMenu();
                else this.enterDataMode();
                this.secondFunction = false; break;
            case 'statvar':
                if (this.secondFunction) this.exitStatMode();
                else this.enterStatVarMode();
                this.secondFunction = false; break;
            case 'arrow-up': this.handleArrowUp(); break;
            case 'arrow-down': this.handleArrowDown(); break;
            case 'arrow-left': this.handleArrowLeft(); break;
            case 'arrow-right': this.handleArrowRight(); break;
            case 'del': this.deleteLastChar(); break;
            case 'clear': this.clear(); break;
            case 'enter':
                if (this.menuMode) this.selectMenuItem();
                else if (this.dataEntryMode) this.addDataPoint();
                else if (this.statVarMode) this.displayStatVar();
                else this.calculate();
                break;
            case 'on': this.reset(); break;
        }
    }

    handleKeyboard(e) {
        const key = e.key;
        if (key >= '0' && key <= '9') { this.handleNumber(key); e.preventDefault(); }
        const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' };
        if (opMap[key]) { this.handleOperator(opMap[key]); e.preventDefault(); }
        switch(key) {
            case 'Enter':
                if (this.menuMode) this.selectMenuItem();
                else if (this.dataEntryMode) this.addDataPoint();
                else if (this.statVarMode) this.displayStatVar();
                else this.calculate();
                e.preventDefault(); break;
            case 'Escape': this.clear(); e.preventDefault(); break;
            case 'Backspace': this.deleteLastChar(); e.preventDefault(); break;
            case '.': this.handleDecimal(); e.preventDefault(); break;
            case '(': this.handleFunction('lparen'); e.preventDefault(); break;
            case ')': this.handleFunction('rparen'); e.preventDefault(); break;
            case '^': this.handleFunction('power'); e.preventDefault(); break;
            case '!': this.handleFunction('factorial'); e.preventDefault(); break;
            case 'ArrowUp': this.handleArrowUp(); e.preventDefault(); break;
            case 'ArrowDown': this.handleArrowDown(); e.preventDefault(); break;
            case 'ArrowLeft': this.handleArrowLeft(); e.preventDefault(); break;
            case 'ArrowRight': this.handleArrowRight(); e.preventDefault(); break;
        }
    }

    // --- Arrow Keys ---

    handleArrowUp() {
        if (this.history.length > 0) {
            if (this.historyIndex < 0) this.historyIndex = this.history.length;
            this.historyIndex = Math.max(0, this.historyIndex - 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.updateDisplay();
        }
    }

    handleArrowDown() {
        if (this.dataEntryMode && this.currentInput) { this.addDataPoint(); }
        else if (this.historyIndex >= 0) {
            this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.updateDisplay();
        }
    }

    handleArrowLeft() {
        if (this.menuMode === 'STAT') { this.menuCursor = 0; this.showStatMenu(); }
        else if (this.statVarMode) {
            this.statVarIndex = Math.max(0, this.statVarIndex - 1);
            this.displayStatVar();
        }
    }

    handleArrowRight() {
        if (this.menuMode === 'STAT') { this.menuCursor = 1; this.showStatMenu(); }
        else if (this.statVarMode) {
            const maxIndex = this.statMode === '2-VAR' ? 12 : 4;
            this.statVarIndex = Math.min(maxIndex, this.statVarIndex + 1);
            this.displayStatVar();
        }
    }

    // --- Trig ---

    applyTrigFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;
        let result;
        const rad = this.angleMode === 'DEG' ? value * Math.PI / 180 : value;
        switch(fn) {
            case 'sin': result = Math.sin(rad); break;
            case 'cos': result = Math.cos(rad); break;
            case 'tan': result = Math.tan(rad); break;
            case 'asin':
                result = Math.asin(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'acos':
                result = Math.acos(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'atan':
                result = Math.atan(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'sinh': result = Math.sinh(value); break;
            case 'cosh': result = Math.cosh(value); break;
            case 'tanh': result = Math.tanh(value); break;
            case 'asinh': result = Math.asinh(value); break;
            case 'acosh': result = Math.acosh(value); break;
            case 'atanh': result = Math.atanh(value); break;
        }
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
                result = Math.log10(value); break;
            case 'ln':
                if (value <= 0) { this.showError('DOMAIN ERROR'); return; }
                result = Math.log(value); break;
            case 'pow10': result = Math.pow(10, value); break;
            case 'exp': result = Math.exp(value); break;
            case 'abs': result = Math.abs(value); break;
            case 'factorial':
                if (value < 0 || !Number.isInteger(value) || value > 170) { this.showError('ERROR'); return; }
                result = this.factorial(value); break;
            case 'percent': result = value / 100; break;
            case 'sqrt':
                if (value < 0) { this.showError('DOMAIN ERROR'); return; }
                result = Math.sqrt(value); break;
            case 'square': result = value * value; break;
            case 'reciprocal':
                if (value === 0) { this.showError('DIVIDE BY 0'); return; }
                result = 1 / value; break;
            case 'dms':
                const deg = Math.floor(value);
                const rest = (value - deg) * 100;
                const min = Math.floor(rest);
                const sec = (rest - min) * 100;
                result = deg + min / 60 + sec / 3600; break;
        }
        this.setResult(result);
    }

    factorial(n) {
        if (n < 0 || !Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    getCurrentValue() {
        if (!this.currentInput) return this.lastResult;
        const parts = this.currentInput.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1].replace(/[)▸◂n/d]/g, '');
        if (lastPart === 'π') return Math.PI;
        if (lastPart === '') return this.lastResult;
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

    // --- Decimal ---

    handleDecimal() {
        if (this.waitingForOperand) {
            this.currentInput = '0.';
            this.waitingForOperand = false;
            this.updateDisplay();
            return;
        }
        const parts = this.currentInput.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes('.')) {
            this.currentInput += (lastPart === '' ? '0.' : '.');
            this.updateDisplay();
        }
    }

    // --- Negative ---

    toggleNegative() {
        if (this.waitingForOperand) {
            this.lastResult = -this.lastResult;
            this.result = this.lastResult;
            this.resultLine.textContent = this.formatNumber(this.lastResult);
            return;
        }
        if (this.currentInput) {
            const match = this.currentInput.match(/(.*?)(\(?\-?)(\d+\.?\d*E?[+\-]?\d*)$/);
            if (match) {
                const prefix = match[1], sign = match[2], num = match[3];
                if (sign === '(-' || sign === '-') this.currentInput = prefix + num;
                else this.currentInput = prefix + '(-' + num + ')';
            } else {
                if (this.currentInput.startsWith('(-')) this.currentInput = this.currentInput.slice(2, -1);
                else this.currentInput = '(-' + this.currentInput + ')';
            }
            this.updateDisplay();
        }
    }

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.angleModeDisplay.textContent = this.angleMode;
    }

    // --- Fraction Display ---

    toggleFractionDisplay() {
        this.fractionMode = !this.fractionMode;
        if (this.fractionMode && this.lastResult) {
            this.resultLine.textContent = this.decimalToFraction(this.lastResult);
        } else {
            this.resultLine.textContent = this.formatNumber(this.lastResult);
        }
    }

    decimalToFraction(decimal) {
        if (Number.isInteger(decimal)) return decimal.toString();
        const sign = decimal < 0 ? '-' : '';
        decimal = Math.abs(decimal);
        const tolerance = 1.0e-8;
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = decimal, iterations = 0;
        do {
            let a = Math.floor(b), aux = h1;
            h1 = a * h1 + h2; h2 = aux;
            aux = k1; k1 = a * k1 + k2; k2 = aux;
            if (Math.abs(b - a) < tolerance) break;
            b = 1 / (b - a); iterations++;
        } while (Math.abs(decimal - h1 / k1) > decimal * tolerance && iterations < 100);
        if (k1 === 1) return sign + h1.toString();
        if (h1 > k1) {
            const whole = Math.floor(h1 / k1), rem = h1 % k1;
            if (rem === 0) return sign + whole.toString();
            return `${sign}${whole} ${rem}/${k1}`;
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
        if (this.waitingForOperand) { this.currentInput = ''; this.waitingForOperand = false; }
        this.currentInput += this.memory.toString();
        this.updateDisplay();
    }

    // --- Statistics ---

    showStatMenu() {
        this.menuMode = 'STAT';
        this.menuCursor = this.statMode === '2-VAR' ? 1 : 0;
        const opts = ['1-VAR', '2-VAR'];
        this.inputLine.textContent = opts.map((o, i) => i === this.menuCursor ? `▸${o}` : ` ${o}`).join('  ');
        this.resultLine.textContent = 'Select mode';
    }

    showDataMenu() {
        this.menuMode = 'DATA';
        this.inputLine.textContent = '▸CLRDATA';
        this.resultLine.textContent = 'Clear stat data?';
    }

    selectMenuItem() {
        if (this.menuMode === 'STAT') {
            this.statMode = this.menuCursor === 0 ? '1-VAR' : '2-VAR';
            this.showMessage(`${this.statMode} MODE`);
            this.menuMode = null;
        } else if (this.menuMode === 'DATA') {
            this.statData = { x: [], y: [] };
            this.showMessage('DATA CLEARED');
            this.menuMode = null;
        }
    }

    cycleStatMode() {
        if (!this.statMode) { this.statMode = '1-VAR'; this.showMessage('1-VAR MODE'); }
        else if (this.statMode === '1-VAR') { this.statMode = '2-VAR'; this.showMessage('2-VAR MODE'); }
        else { this.statMode = null; this.statData = { x: [], y: [] }; this.showMessage('STAT OFF'); }
    }

    enterDataMode() {
        if (!this.statMode) { this.showMessage('SELECT STAT MODE'); return; }
        this.dataEntryMode = true;
        this.currentInput = '';
        this.currentDataVar = 'x';
        this.showMessage(`DATA ENTRY ${this.statMode}`);
    }

    addDataPoint() {
        if (!this.dataEntryMode) return;
        const value = parseFloat(this.currentInput);
        if (isNaN(value)) { this.showError('INVALID DATA'); return; }
        if (this.statMode === '1-VAR') {
            this.statData.x.push(value);
            this.currentInput = '';
            this.showMessage(`n = ${this.statData.x.length}`);
        } else if (this.statMode === '2-VAR') {
            if (this.currentDataVar === 'x') {
                this.statData.x.push(value); this.currentDataVar = 'y';
                this.currentInput = ''; this.showMessage('Enter Y');
            } else {
                this.statData.y.push(value); this.currentDataVar = 'x';
                this.currentInput = ''; this.showMessage(`n = ${this.statData.x.length}`);
            }
        }
        setTimeout(() => {
            if (this.dataEntryMode) {
                this.inputLine.textContent = this.currentInput || '';
                this.resultLine.textContent = `${this.statMode} | Enter ${this.currentDataVar.toUpperCase()}`;
            }
        }, 1500);
    }

    enterStatVarMode() {
        if (!this.statMode) { this.showMessage('NO STAT MODE'); return; }
        if (this.statData.x.length === 0) { this.showMessage('NO DATA'); return; }
        this.statVarMode = true; this.statVarIndex = 0;
        this.displayStatVar();
    }

    exitStatMode() {
        this.statMode = null; this.statData = { x: [], y: [] };
        this.statVarMode = false; this.dataEntryMode = false;
        this.showMessage('STAT OFF');
    }

    displayStatVar() {
        const varName = this.statVars[this.statVarIndex];
        const stats = this.calculateStatistics();
        if (!stats) { this.showMessage('NO DATA'); return; }
        const valueMap = {
            'n': this.statData.x.length, 'x̄': stats.xMean, 'Σx': stats.xSum,
            'Σx²': stats.xSumSq, 'σx': stats.xStd
        };
        if (this.statMode === '2-VAR') {
            Object.assign(valueMap, {
                'ȳ': stats.yMean, 'Σy': stats.ySum, 'Σy²': stats.ySumSq,
                'σy': stats.yStd, 'Σxy': stats.xySum, 'r': stats.r,
                'a': stats.intercept, 'b': stats.slope
            });
        }
        const value = valueMap[varName];
        this.inputLine.textContent = `${varName} =`;
        if (value === undefined) {
            this.resultLine.textContent = 'N/A (2-VAR only)';
        } else {
            this.resultLine.textContent = this.formatNumber(value);
            this.lastResult = value;
        }
    }

    calculateStatistics() {
        if (!this.statMode || this.statData.x.length === 0) return null;
        const stats = {}, n = this.statData.x.length, xData = this.statData.x;
        const xSum = xData.reduce((a, b) => a + b, 0);
        stats.xSum = xSum; stats.xMean = xSum / n;
        stats.xStd = Math.sqrt(xData.reduce((s, v) => s + Math.pow(v - stats.xMean, 2), 0) / n);
        stats.xSumSq = xData.reduce((s, v) => s + v * v, 0);
        if (this.statMode === '2-VAR' && this.statData.y.length === n) {
            const yData = this.statData.y;
            const ySum = yData.reduce((a, b) => a + b, 0);
            stats.ySum = ySum; stats.yMean = ySum / n;
            stats.yStd = Math.sqrt(yData.reduce((s, v) => s + Math.pow(v - stats.yMean, 2), 0) / n);
            stats.ySumSq = yData.reduce((s, v) => s + v * v, 0);
            const xySum = xData.reduce((s, x, i) => s + x * yData[i], 0);
            stats.xySum = xySum;
            stats.slope = (n * xySum - xSum * ySum) / (n * stats.xSumSq - xSum * xSum);
            stats.intercept = (ySum - stats.slope * xSum) / n;
            const corrN = n * xySum - xSum * ySum;
            const corrD = Math.sqrt((n * stats.xSumSq - xSum * xSum) * (n * stats.ySumSq - ySum * ySum));
            stats.r = corrD !== 0 ? corrN / corrD : 0;
        }
        return stats;
    }

    // --- Expression Evaluation ---

    calculate() {
        if (!this.currentInput) return;
        try {
            let expr = this.currentInput
                .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
                .replace(/π/g, `(${Math.PI})`).replace(/\^/g, '**');

            // Fraction markers → division
            expr = expr.replace(/▸n\/d◂/g, '/');

            // EE
            expr = expr.replace(/(\d+\.?\d*)E([+\-]?\d+)/g, '($1*Math.pow(10,$2))');

            // nCr/nPr
            expr = expr.replace(/(\d+\.?\d*)nCr(\d+\.?\d*)/g, (_, n, r) =>
                this.combination(parseFloat(n), parseFloat(r)));
            expr = expr.replace(/(\d+\.?\d*)nPr(\d+\.?\d*)/g, (_, n, r) =>
                this.permutation(parseFloat(n), parseFloat(r)));

            // Roots
            expr = expr.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)')
                       .replace(/√(\d+\.?\d*)/g, 'Math.sqrt($1)');
            expr = expr.replace(/(\d+\.?\d*)ⁿ√\(([^)]+)\)/g, 'Math.pow($2,1/$1)')
                       .replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2,1/$1)');

            // Implicit multiplication
            expr = expr.replace(/(\d)\(/g, '$1*(')
                       .replace(/\)(\d)/g, ')*$1')
                       .replace(/\)\(/g, ')*(');

            const result = this.safeEval(expr);
            if (isNaN(result) || !isFinite(result)) { this.showError('ERROR'); return; }

            this.history.push({ input: this.currentInput, result: result });
            this.historyIndex = -1;
            this.result = result;
            this.lastResult = result;
            this.resultLine.textContent = this.formatNumber(result);
            this.waitingForOperand = true;
            this.renderHistory();

        } catch (error) { this.showError('SYNTAX ERROR'); }
    }

    combination(n, r) {
        n = Math.round(n); r = Math.round(r);
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
    }

    permutation(n, r) {
        n = Math.round(n); r = Math.round(r);
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / this.factorial(n - r);
    }

    safeEval(expression) {
        const stripped = expression.replace(/Math\.(pow|sqrt|PI)/g, '').replace(/\s/g, '');
        if (/[a-df-oq-zA-DF-OQ-Z_$]/.test(stripped)) throw new Error('Invalid');
        try { return new Function('return ' + expression)(); }
        catch (e) { throw new Error('Invalid'); }
    }

    // --- MathPrint Rendering ---

    renderMathPrint(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);

        // Fractions: n▸n/d◂m → stacked fraction
        html = html.replace(/(\d+)▸n\/d◂(\d+)/g,
            '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">$2</span></span>');
        html = html.replace(/(\d+)▸n\/d◂/g,
            '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">_</span></span>');
        html = html.replace(/▸n\/d◂(\d+)/g,
            '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">$1</span></span>');
        html = html.replace(/▸n\/d◂/g,
            '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">_</span></span>');

        // Exponents: n^m → n<sup>m</sup>
        html = html.replace(/(\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/g,
            '$1<span class="mp-sup">$2</span>');
        html = html.replace(/(\d+(?:\.\d+)?)\^/g,
            '$1<span class="mp-sup">_</span>');

        // Square roots: √(content) or √number
        html = html.replace(/√\(([^)]+)\)/g,
            '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');
        html = html.replace(/√(\d+\.?\d*)/g,
            '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');

        // Nth roots
        html = html.replace(/(\d+)ⁿ√\(([^)]+)\)/g,
            '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/(\d+)ⁿ√(\d+\.?\d*)/g,
            '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/ⁿ√/g,
            '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">_</span></span>');

        return html;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return text.replace(/[&<>"]/g, c => map[c]);
    }

    // --- 4-Line History Display ---

    renderHistory() {
        if (!this.historyDisplay) return;
        const recent = this.history.slice(-2);
        this.historyDisplay.innerHTML = recent.map(entry =>
            `<div class="history-entry">` +
            `<div class="history-input">${this.escapeHtml(entry.input)}</div>` +
            `<div class="history-result">${this.formatNumber(entry.result)}</div>` +
            `</div>`
        ).join('');
    }

    // --- Display ---

    formatNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return 'ERROR';
        if (Math.abs(num) < 1e-10 && num !== 0) return num.toExponential(6);
        if (Math.abs(num) > 9999999999) return num.toExponential(6);
        const rounded = Math.round(num * 1e10) / 1e10;
        const str = rounded.toString();
        if (str.replace(/[.\-]/g, '').length > 10) return num.toPrecision(10);
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
        this.inputLine.classList.remove('mathprint');
        setTimeout(() => {
            if (!this.dataEntryMode && !this.statVarMode) {
                this.inputLine.classList.add('mathprint');
                this.updateDisplay();
            }
        }, 1500);
    }

    deleteLastChar() {
        if (this.currentInput.length > 0) {
            if (this.currentInput.endsWith('nCr')) this.currentInput = this.currentInput.slice(0, -3);
            else if (this.currentInput.endsWith('nPr')) this.currentInput = this.currentInput.slice(0, -3);
            else if (this.currentInput.endsWith('ⁿ√')) this.currentInput = this.currentInput.slice(0, -2);
            else if (this.currentInput.endsWith('(-')) this.currentInput = this.currentInput.slice(0, -2);
            else if (this.currentInput.endsWith('▸n/d◂')) this.currentInput = this.currentInput.slice(0, -5);
            else this.currentInput = this.currentInput.slice(0, -1);
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
        this.result = 0; this.lastResult = 0; this.memory = 0;
        this.waitingForOperand = false; this.secondFunction = false;
        this.hypMode = false; this.fractionMode = false;
        this.statMode = null; this.statData = { x: [], y: [] };
        this.dataEntryMode = false; this.currentDataVar = 'x';
        this.menuMode = null; this.statVarMode = false;
        this.history = []; this.historyIndex = -1;
        this.memoryIndicator.textContent = '';
        this.hypIndicator.textContent = '';
        this.angleModeDisplay.textContent = 'DEG';
        this.angleMode = 'DEG';
        this.resultLine.textContent = '0';
        if (this.historyDisplay) this.historyDisplay.innerHTML = '';
        if (this.secondIndicator) this.secondIndicator.textContent = '';
        this.updateDisplay();
        this.updateSecondFunctionIndicator();
    }

    updateDisplay() {
        if (this.currentInput) {
            this.inputLine.innerHTML = this.renderMathPrint(this.currentInput);
            this.inputLine.classList.add('mathprint');
        } else {
            this.inputLine.innerHTML = '';
            this.inputLine.classList.add('mathprint');
        }
        if (!this.waitingForOperand && !this.currentInput) {
            this.resultLine.textContent = '0';
        }
    }

    updateSecondFunctionIndicator() {
        const btn = document.querySelector('[data-action="2nd"]');
        if (btn) {
            btn.style.background = this.secondFunction
                ? 'linear-gradient(145deg, #f39c12, #e67e22)'
                : 'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
        if (this.secondIndicator) {
            this.secondIndicator.textContent = this.secondFunction ? '2ND' : '';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const calculator = new TI30XSMultiView();
});
