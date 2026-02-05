// Floating TI-30XIIS Calculator with Drag Support and Statistical Functions
class FloatingCalculator {
    constructor() {
        this.floatingCalc = document.getElementById('floating-calculator');
        this.toggleBtn = document.getElementById('toggle-calculator-btn');
        this.closeBtn = document.getElementById('close-calculator-btn');
        this.dragHandle = document.getElementById('calculator-drag-handle');
        this.sidebarCalcBtn = document.getElementById('sidebar-calculator-btn');

        // Display elements
        this.inputLine = document.getElementById('calc-input-line');
        this.resultLine = document.getElementById('calc-result-line');
        this.angleModeDisplay = document.getElementById('calc-angle-mode');
        this.hypIndicator = document.getElementById('calc-hyp-indicator');
        this.memoryIndicator = document.getElementById('calc-memory-indicator');

        // Calculator state
        this.currentInput = '';
        this.result = 0;
        this.memory = 0;
        this.angleMode = 'DEG';
        this.secondFunction = false;
        this.hypMode = false;
        this.fractionMode = false;
        this.statMode = null; // null, '1-VAR', '2-VAR'
        this.statData = { x: [], y: [] };
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];
        this.dataEntryMode = false;
        this.currentDataVar = 'x'; // 'x' or 'y'
        this.menuMode = null; // 'STAT', 'DATA', 'STATVAR', null
        this.menuCursor = 0;
        this.statVarMode = false;
        this.statVarIndex = 0;
        this.statVars = ['n', 'x̄', 'Σx', 'Σx²', 'σx', 'ȳ', 'Σy', 'Σy²', 'σy', 'Σxy', 'r', 'a', 'b', 'ŷ'];

        // Drag state
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;

        // Teacher access control state
        this.calculatorAccess = 'always'; // 'always', 'never', 'skill-based', 'teacher-discretion'
        this.calculatorNote = '';
        this.accessChecked = false;

        this.initializeEventListeners();
        this.checkCalculatorAccess(); // Check teacher settings on init
    }

    // Check teacher's calculator access setting for this student
    async checkCalculatorAccess() {
        try {
            const response = await fetch('/api/student/my-calculator-access');
            const data = await response.json();

            if (data.success) {
                this.calculatorAccess = data.calculatorAccess;
                this.calculatorNote = data.calculatorNote || '';
                this.accessChecked = true;

                console.log(`🧮 Calculator access: ${this.calculatorAccess}`);

                // Apply access restrictions
                this.applyAccessRestrictions();
            }
        } catch (error) {
            console.warn('Could not check calculator access:', error);
            // Default to allowing calculator if check fails
            this.calculatorAccess = 'skill-based';
            this.accessChecked = true;
        }
    }

    // Apply calculator access restrictions based on teacher settings
    applyAccessRestrictions() {
        if (this.calculatorAccess === 'never') {
            // Hide calculator completely
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = 'none';
            }
            if (this.toggleBtn) {
                this.toggleBtn.style.display = 'none';
            }
            // Make sure calculator is hidden
            this.hideCalculator();
            console.log('🚫 Calculator disabled by teacher');
        } else if (this.calculatorAccess === 'skill-based' || this.calculatorAccess === 'teacher-discretion') {
            // Show calculator but add visual indicator
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = this.calculatorAccess === 'skill-based'
                    ? 'Calculator (use for complex calculations only)'
                    : 'Calculator (teacher discretion)';
            }
        } else {
            // 'always' - full access
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = 'Calculator';
            }
        }
    }

    // Override toggle to check access
    toggleCalculator() {
        // Check if calculator is blocked
        if (this.calculatorAccess === 'never') {
            console.log('🚫 Calculator access denied by teacher');
            return;
        }

        if (this.floatingCalc.style.display === 'none') {
            this.showCalculator();
        } else {
            this.hideCalculator();
        }
    }

    initializeEventListeners() {
        // Toggle calculator
        this.toggleBtn.addEventListener('click', () => this.toggleCalculator());
        this.closeBtn.addEventListener('click', () => this.hideCalculator());

        // Drag functionality
        this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
        this.dragHandle.addEventListener('touchstart', (e) => this.dragStart(e));

        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('touchmove', (e) => this.drag(e));

        document.addEventListener('mouseup', () => this.dragEnd());
        document.addEventListener('touchend', () => this.dragEnd());

        // Calculator buttons
        this.floatingCalc.querySelectorAll('[data-num]').forEach(btn => {
            btn.addEventListener('click', () => this.handleNumber(btn.dataset.num));
        });

        this.floatingCalc.querySelectorAll('[data-op]').forEach(btn => {
            btn.addEventListener('click', () => this.handleOperator(btn.dataset.op));
        });

        this.floatingCalc.querySelectorAll('[data-fn]').forEach(btn => {
            btn.addEventListener('click', () => {
                const fn = this.secondFunction && btn.dataset.fn2 ? btn.dataset.fn2 : btn.dataset.fn;
                this.handleFunction(fn);
            });
        });

        this.floatingCalc.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
        });

        // Keyboard support
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    handleKeyboard(e) {
        // Only handle keyboard when calculator is visible
        if (this.floatingCalc.style.display === 'none') return;

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

    showCalculator() {
        this.floatingCalc.style.display = 'block';
        this.centerCalculator();
    }

    hideCalculator() {
        this.floatingCalc.style.display = 'none';
    }

    centerCalculator() {
        this.floatingCalc.style.transform = 'translate(-50%, -50%)';
        this.xOffset = 0;
        this.yOffset = 0;
    }

    dragStart(e) {
        if (e.type === 'touchstart') {
            this.initialX = e.touches[0].clientX - this.xOffset;
            this.initialY = e.touches[0].clientY - this.yOffset;
        } else {
            this.initialX = e.clientX - this.xOffset;
            this.initialY = e.clientY - this.yOffset;
        }

        if (e.target === this.dragHandle || this.dragHandle.contains(e.target)) {
            this.isDragging = true;
        }
    }

    drag(e) {
        if (this.isDragging) {
            e.preventDefault();

            if (e.type === 'touchmove') {
                this.currentX = e.touches[0].clientX - this.initialX;
                this.currentY = e.touches[0].clientY - this.initialY;
            } else {
                this.currentX = e.clientX - this.initialX;
                this.currentY = e.clientY - this.initialY;
            }

            this.xOffset = this.currentX;
            this.yOffset = this.currentY;

            this.setTranslate(this.currentX, this.currentY);
        }
    }

    dragEnd() {
        this.isDragging = false;
    }

    setTranslate(xPos, yPos) {
        this.floatingCalc.style.transform = `translate(calc(-50% + ${xPos}px), calc(-50% + ${yPos}px))`;
    }

    // Calculator logic methods
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
                this.currentInput += '/';
                this.updateDisplay();
                break;
            case 'dec':
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
                if (this.secondFunction) {
                    // 2nd + STAT = show stat mode menu
                    this.showStatMenu();
                } else {
                    // Just STAT = shortcut to enter stat mode
                    this.cycleStatMode();
                }
                this.secondFunction = false;
                break;
            case 'data':
                if (this.secondFunction) {
                    // 2nd + DATA = show data menu with CLRDATA
                    this.showDataMenu();
                } else {
                    // Just DATA = enter data entry mode
                    this.enterDataMode();
                }
                this.secondFunction = false;
                break;
            case 'statvar':
                if (this.secondFunction) {
                    // 2nd + STATVAR = EXIT STAT
                    this.exitStatMode();
                } else {
                    // STATVAR = show stat variables
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

    // Arrow key handlers
    handleArrowUp() {
        // Arrow up does nothing in most modes
    }

    handleArrowDown() {
        if (this.dataEntryMode) {
            // Down arrow in data entry mode
            if (this.currentInput) {
                this.addDataPoint();
            }
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
            const maxIndex = this.statMode === '2-VAR' ? 13 : 4;
            this.statVarIndex = Math.min(maxIndex, this.statVarIndex + 1);
            this.displayStatVar();
        }
    }

    // Menu functions
    showStatMenu() {
        this.menuMode = 'STAT';
        this.menuCursor = this.statMode === '2-VAR' ? 1 : 0;
        const options = ['1-VAR', '2-VAR'];
        this.inputLine.textContent = options.map((opt, i) =>
            i === this.menuCursor ? `>${opt}<` : opt
        ).join(' ');
        this.resultLine.textContent = 'Select mode';
    }

    showDataMenu() {
        this.menuMode = 'DATA';
        this.menuCursor = 0;
        this.inputLine.textContent = '>CLRDATA<';
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
            // Clear data
            this.statData = { x: [], y: [] };
            this.showMessage('DATA CLEARED');
            this.menuMode = null;
        }
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
            case 'ŷ':
                // For ŷ, user needs to enter x value
                this.inputLine.textContent = `ŷ (Enter x)`;
                this.resultLine.textContent = '';
                return;
        }

        if (value === undefined) {
            this.inputLine.textContent = varName;
            this.resultLine.textContent = 'N/A (2-VAR only)';
        } else {
            this.inputLine.textContent = varName;
            this.resultLine.textContent = this.formatNumber(value);
        }
    }

    // Statistical functions
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
            this.updateDisplay();
        }, 1000);
    }

    calculateStatistics() {
        if (!this.statMode || this.statData.x.length === 0) {
            return null;
        }

        const stats = {};
        const n = this.statData.x.length;
        const xData = this.statData.x;

        // Calculate sums
        const xSum = xData.reduce((a, b) => a + b, 0);
        stats.xSum = xSum;
        stats.xMean = xSum / n;

        // Calculate standard deviation
        const xVariance = xData.reduce((sum, val) => sum + Math.pow(val - stats.xMean, 2), 0) / n;
        stats.xStd = Math.sqrt(xVariance);

        // Calculate sum of squares
        stats.xSumSq = xData.reduce((sum, val) => sum + val * val, 0);

        if (this.statMode === '2-VAR' && this.statData.y.length === n) {
            const yData = this.statData.y;
            const ySum = yData.reduce((a, b) => a + b, 0);
            stats.ySum = ySum;
            stats.yMean = ySum / n;

            const yVariance = yData.reduce((sum, val) => sum + Math.pow(val - stats.yMean, 2), 0) / n;
            stats.yStd = Math.sqrt(yVariance);

            // Calculate sum of squares
            stats.ySumSq = yData.reduce((sum, val) => sum + val * val, 0);

            // Linear regression: y = a + bx
            const xySum = xData.reduce((sum, x, i) => sum + x * yData[i], 0);
            stats.xySum = xySum;
            const xSumSq = stats.xSumSq;

            const slope = (n * xySum - xSum * ySum) / (n * xSumSq - xSum * xSum);
            const intercept = (ySum - slope * xSum) / n;

            stats.slope = slope; // b
            stats.intercept = intercept; // a

            // Correlation coefficient (r)
            const corrNumerator = n * xySum - xSum * ySum;
            const corrDenominator = Math.sqrt((n * xSumSq - xSum * xSum) * (n * stats.ySumSq - ySum * ySum));
            stats.r = corrNumerator / corrDenominator;

            // R-squared
            stats.r2 = stats.r * stats.r;
        }

        return stats;
    }

    showStatResult(statType) {
        const stats = this.calculateStatistics();
        if (!stats) return;

        let result;
        switch(statType) {
            case 'xMean':
                result = stats.xMean;
                this.showMessage('x̄');
                break;
            case 'xStd':
                result = stats.xStd;
                this.showMessage('σx');
                break;
            case 'yMean':
                result = stats.yMean || 'N/A';
                this.showMessage('ȳ');
                break;
            case 'yStd':
                result = stats.yStd || 'N/A';
                this.showMessage('σy');
                break;
            case 'slope':
                result = stats.slope || 'N/A';
                this.showMessage('b (slope)');
                break;
            case 'intercept':
                result = stats.intercept || 'N/A';
                this.showMessage('a (intercept)');
                break;
            case 'r':
                result = stats.r || 'N/A';
                this.showMessage('r (correlation)');
                break;
            case 'r2':
                result = stats.r2 || 'N/A';
                this.showMessage('r²');
                break;
            case 'n':
                result = this.statData.x.length;
                this.showMessage('n');
                break;
        }

        if (result !== 'N/A') {
            this.setResult(result);
        }
    }

    // Trigonometric functions
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

    calculate() {
        if (!this.currentInput) return;

        // Check for stat variable access
        if (this.currentInput.toLowerCase().includes('stat')) {
            this.handleStatCommand();
            return;
        }

        try {
            let expression = this.currentInput
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/−/g, '-')
                .replace(/π/g, Math.PI.toString())
                .replace(/\^/g, '**');

            expression = this.handleCombinations(expression);
            expression = this.handlePermutations(expression);
            expression = this.handleSquareRoot(expression);
            expression = this.handleNthRoot(expression);

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

    handleStatCommand() {
        // Parse stat commands like "stat.xmean", "stat.r", etc.
        const input = this.currentInput.toLowerCase();

        if (input.includes('xmean') || input.includes('x̄')) {
            this.showStatResult('xMean');
        } else if (input.includes('ymean') || input.includes('ȳ')) {
            this.showStatResult('yMean');
        } else if (input.includes('xstd') || input.includes('σx')) {
            this.showStatResult('xStd');
        } else if (input.includes('ystd') || input.includes('σy')) {
            this.showStatResult('yStd');
        } else if (input.includes('slope') || input === 'b') {
            this.showStatResult('slope');
        } else if (input.includes('intercept') || input === 'a') {
            this.showStatResult('intercept');
        } else if (input === 'r' || input.includes('corr')) {
            this.showStatResult('r');
        } else if (input === 'r2' || input === 'r²') {
            this.showStatResult('r2');
        } else if (input === 'n') {
            this.showStatResult('n');
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
        return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
    }

    permutation(n, r) {
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / this.factorial(n - r);
    }

    handleSquareRoot(expression) {
        return expression.replace(/√(\d+\.?\d*)/g, 'Math.sqrt($1)');
    }

    handleNthRoot(expression) {
        return expression.replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2, 1/$1)');
    }

    safeEval(expression) {
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

    showMessage(message) {
        this.inputLine.textContent = message;
        setTimeout(() => {
            if (!this.dataEntryMode) {
                this.updateDisplay();
            }
        }, 1500);
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
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
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
        this.statData = { x: [], y: [] };
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
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
        const btn2nd = this.floatingCalc.querySelector('[data-action="2nd"]');
        if (this.secondFunction) {
            btn2nd.style.background = 'linear-gradient(145deg, #f39c12, #e67e22)';
        } else {
            btn2nd.style.background = 'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.floatingCalc = new FloatingCalculator();
});
