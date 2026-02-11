// Floating TI-30XS MultiView Calculator - Enhanced Implementation
// Features: Cursor editing, ANS variable, keyboard input, table, error handling,
// mobile touch, expression validation, memory registers, copy/paste
// Plus: Drag support, teacher access control

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
        this.historyDisplay = document.getElementById('calc-display-history');
        this.secondIndicator = document.getElementById('calc-2nd-indicator');
        this.enterBtn = this.floatingCalc ? this.floatingCalc.querySelector('[data-action="enter"]') : null;

        // Calculator state
        this.currentInput = '';
        this.cursorPos = 0;
        this.result = 0;
        this.memory = 0;
        this.ans = 0;
        this.angleMode = 'DEG';
        this.secondFunction = false;
        this.hypMode = false;
        this.fractionMode = false;
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];
        this.historyIndex = -1;

        // Statistics state
        this.statMode = null;
        this.statData = { x: [], y: [] };
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
        this.menuMode = null;
        this.menuCursor = 0;
        this.statVarMode = false;
        this.statVarIndex = 0;
        this.statVars = ['n', 'x̄', 'Σx', 'Σx²', 'σx', 'ȳ', 'Σy', 'Σy²', 'σy', 'Σxy', 'r', 'a', 'b'];

        // Memory registers (x1-x7)
        this.memoryRegisters = {};
        for (let i = 1; i <= 7; i++) this.memoryRegisters['x' + i] = 0;
        this.stoMode = false;
        this.rclMode = false;
        this.memRegCursor = 0;

        // Table mode
        this.tableMode = null;
        this.tableExpression = '';
        this.tableStart = 0;
        this.tableEnd = 10;
        this.tableStep = 1;
        this.tableResults = [];
        this.tableScrollIndex = 0;

        // Expression validation
        this.expressionValid = true;

        // Drag state
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;

        // Teacher access control
        this.calculatorAccess = 'always';
        this.calculatorNote = '';
        this.accessChecked = false;

        // Copy toast
        this.copyToast = null;
        this.createCopyToast();

        this.initializeEventListeners();
        this.setupCopyPaste();
        this.setupMobileTouch();
        this.checkCalculatorAccess();
    }

    // ==================== TEACHER ACCESS CONTROL ====================

    async checkCalculatorAccess() {
        try {
            const response = await fetch('/api/calculator/access');
            const data = await response.json();
            if (data.success) {
                this.calculatorAccess = data.calculatorAccess;
                this.calculatorNote = data.calculatorNote || '';
                this.accessChecked = true;
                this.applyAccessRestrictions();
            }
        } catch (error) {
            console.warn('Could not check calculator access:', error);
            this.calculatorAccess = 'skill-based';
            this.accessChecked = true;
        }
    }

    applyAccessRestrictions() {
        if (this.calculatorAccess === 'never') {
            if (this.sidebarCalcBtn) this.sidebarCalcBtn.style.display = 'none';
            if (this.toggleBtn) this.toggleBtn.style.display = 'none';
            this.hideCalculator();
        } else if (this.calculatorAccess === 'skill-based' || this.calculatorAccess === 'teacher-discretion') {
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = this.calculatorAccess === 'skill-based'
                    ? 'Calculator (use for complex calculations only)'
                    : 'Calculator (teacher discretion)';
            }
        } else {
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = 'Calculator';
            }
        }
    }

    toggleCalculator() {
        if (this.calculatorAccess === 'never') return;
        if (this.floatingCalc.style.display === 'none') this.showCalculator();
        else this.hideCalculator();
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

    // ==================== DRAG ====================

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
        if (!this.isDragging) return;
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
        this.floatingCalc.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;
    }

    dragEnd() { this.isDragging = false; }

    // ==================== CURSOR MANAGEMENT ====================

    insertAtCursor(text) {
        this.currentInput = this.currentInput.slice(0, this.cursorPos) + text + this.currentInput.slice(this.cursorPos);
        this.cursorPos += text.length;
    }

    insertPrefix(text) {
        if (this.waitingForOperand) {
            this.currentInput = '';
            this.cursorPos = 0;
            this.waitingForOperand = false;
        }
        this.insertAtCursor(text);
        this.updateDisplay();
    }

    deleteAtCursor() {
        if (this.cursorPos <= 0) return;
        const before = this.currentInput.substring(0, this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (before.endsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (before.endsWith('10^(')) len = 4;
            else if (before.endsWith('e^(')) len = 3;
            else if (before.endsWith('▸n/d◂')) len = 5;
            else if (before.endsWith('nCr')) len = 3;
            else if (before.endsWith('nPr')) len = 3;
            else if (before.endsWith('Ans')) len = 3;
            else if (before.endsWith('ⁿ√')) len = 2;
            else if (before.endsWith('√(')) len = 2;
            else if (before.endsWith('(-')) len = 2;
        }
        this.currentInput = this.currentInput.slice(0, this.cursorPos - len) + this.currentInput.slice(this.cursorPos);
        this.cursorPos -= len;
    }

    moveCursorLeft() {
        if (this.cursorPos <= 0) return;
        const before = this.currentInput.substring(0, this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (before.endsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (before.endsWith('10^(')) len = 4;
            else if (before.endsWith('e^(')) len = 3;
            else if (before.endsWith('▸n/d◂')) len = 5;
            else if (before.endsWith('nCr')) len = 3;
            else if (before.endsWith('nPr')) len = 3;
            else if (before.endsWith('Ans')) len = 3;
            else if (before.endsWith('ⁿ√')) len = 2;
            else if (before.endsWith('√(')) len = 2;
            else if (before.endsWith('(-')) len = 2;
        }
        this.cursorPos = Math.max(0, this.cursorPos - len);
    }

    moveCursorRight() {
        if (this.cursorPos >= this.currentInput.length) return;
        const after = this.currentInput.substring(this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (after.startsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (after.startsWith('10^(')) len = 4;
            else if (after.startsWith('e^(')) len = 3;
            else if (after.startsWith('▸n/d◂')) len = 5;
            else if (after.startsWith('nCr')) len = 3;
            else if (after.startsWith('nPr')) len = 3;
            else if (after.startsWith('Ans')) len = 3;
            else if (after.startsWith('ⁿ√')) len = 2;
            else if (after.startsWith('√(')) len = 2;
            else if (after.startsWith('(-')) len = 2;
        }
        this.cursorPos = Math.min(this.currentInput.length, this.cursorPos + len);
    }

    // ==================== EVENT LISTENERS ====================

    initializeEventListeners() {
        this.toggleBtn.addEventListener('click', () => this.toggleCalculator());
        this.closeBtn.addEventListener('click', () => this.hideCalculator());

        // Drag
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

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // ==================== INPUT HANDLERS ====================

    handleNumber(num) {
        if (this.stoMode || this.rclMode) {
            const regNum = parseInt(num);
            if (regNum >= 1 && regNum <= 7) this.selectMemoryRegister(regNum);
            return;
        }
        if (this.tableMode === 'expr') { this.tableExpression += num; this.renderTableSetup(); return; }
        if (this.tableMode === 'start' || this.tableMode === 'end' || this.tableMode === 'step') {
            this.currentInput += num; this.renderTableSetup(); return;
        }
        if (this.dataEntryMode) {
            this.currentInput += num;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay(); return;
        }
        if (this.waitingForOperand) {
            this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false;
        }
        this.insertAtCursor(num);
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleOperator(op) {
        if (this.tableMode === 'expr') { this.tableExpression += op; this.renderTableSetup(); return; }

        const displayMap = { '+': '+', '-': '−', '−': '−', '×': '×', '÷': '÷', '*': '×', '/': '÷' };
        const displayOp = displayMap[op] || op;

        if (this.waitingForOperand) {
            this.currentInput = 'Ans' + displayOp;
            this.cursorPos = this.currentInput.length;
            this.waitingForOperand = false;
        } else if (this.currentInput) {
            const charBefore = this.cursorPos > 0 ? this.currentInput[this.cursorPos - 1] : '';
            if (['+', '−', '×', '÷'].includes(charBefore)) {
                this.currentInput = this.currentInput.slice(0, this.cursorPos - 1) + displayOp + this.currentInput.slice(this.cursorPos);
            } else {
                this.insertAtCursor(displayOp);
            }
        }
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleFunction(fn) {
        if (this.tableMode === 'expr') {
            const ins = {
                'pi': 'π', 'power': '^', 'square': 'x²', 'sqrt': '√(',
                'lparen': '(', 'rparen': ')', 'decimal': '.', 'negative': '(-',
                'log': 'log(', 'ln': 'ln(', 'abs': 'abs(',
                'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(',
                'asin': 'asin(', 'acos': 'acos(', 'atan': 'atan(',
                'pow10': '10^(', 'exp': 'e^('
            };
            if (fn === 'negative') this.tableExpression += '(-';
            else if (ins[fn]) this.tableExpression += ins[fn];
            this.renderTableSetup(); return;
        }
        if (this.tableMode === 'start' || this.tableMode === 'end' || this.tableMode === 'step') {
            if (fn === 'decimal') {
                if (!this.currentInput.includes('.')) this.currentInput += this.currentInput === '' ? '0.' : '.';
                this.renderTableSetup(); return;
            }
            if (fn === 'negative') {
                this.currentInput = this.currentInput.startsWith('-') ? this.currentInput.slice(1) : '-' + this.currentInput;
                this.renderTableSetup(); return;
            }
            return;
        }

        switch(fn) {
            case 'sin': {
                const name = this.hypMode ? 'sinh(' : 'sin(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'cos': {
                const name = this.hypMode ? 'cosh(' : 'cos(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'tan': {
                const name = this.hypMode ? 'tanh(' : 'tan(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'asin': {
                const name = this.hypMode ? 'asinh(' : 'asin(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'acos': {
                const name = this.hypMode ? 'acosh(' : 'acos(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'atan': {
                const name = this.hypMode ? 'atanh(' : 'atan(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'sinh': this.insertPrefix('sinh('); break;
            case 'cosh': this.insertPrefix('cosh('); break;
            case 'tanh': this.insertPrefix('tanh('); break;
            case 'log': this.insertPrefix('log('); break;
            case 'pow10': this.insertPrefix('10^('); break;
            case 'ln': this.insertPrefix('ln('); break;
            case 'exp': this.insertPrefix('e^('); break;
            case 'square': this.applyFunction('square'); break;
            case 'sqrt': this.insertPrefix('√('); break;
            case 'power':
                if (this.waitingForOperand) {
                    this.currentInput = 'Ans^'; this.cursorPos = this.currentInput.length; this.waitingForOperand = false;
                } else { this.insertAtCursor('^'); }
                this.updateDisplay(); break;
            case 'nthroot':
                this.insertAtCursor('ⁿ√'); this.updateDisplay(); break;
            case 'reciprocal': this.applyFunction('reciprocal'); break;
            case 'pi':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('π'); this.updateDisplay(); break;
            case 'hyp':
                this.hypMode = !this.hypMode;
                this.hypIndicator.textContent = this.hypMode ? 'HYP' : ''; break;
            case 'ee':
                if (this.waitingForOperand) { this.currentInput = 'AnsE'; this.cursorPos = 4; this.waitingForOperand = false; }
                else if (this.currentInput) { this.insertAtCursor('E'); }
                else { this.currentInput = '1E'; this.cursorPos = 2; }
                this.updateDisplay(); break;
            case 'lparen':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('('); this.updateDisplay(); break;
            case 'rparen':
                this.insertAtCursor(')'); this.updateDisplay(); break;
            case 'prb': case 'prn':
                if (this.waitingForOperand) { this.currentInput = 'AnsnCr'; this.cursorPos = 6; this.waitingForOperand = false; }
                else { this.insertAtCursor('nCr'); }
                this.updateDisplay(); break;
            case 'nPr':
                if (this.waitingForOperand) { this.currentInput = 'AnsnPr'; this.cursorPos = 6; this.waitingForOperand = false; }
                else { this.insertAtCursor('nPr'); }
                this.updateDisplay(); break;
            case 'nd':
                this.insertAtCursor('▸n/d◂'); this.updateDisplay(); break;
            case 'abc':
                this.insertAtCursor('_'); this.updateDisplay(); break;
            case 'fd': case 'ud': case 'dec': case 'toggle':
                this.toggleFractionDisplay(); break;
            case 'factorial': this.applyFunction('factorial'); break;
            case 'decimal': this.handleDecimal(); break;
            case 'negative': this.toggleNegative(); break;
            case 'sto': this.storeMemory(); break;
            case 'rcl': this.recallMemory(); break;
            case 'percent': this.applyFunction('percent'); break;
            case 'comma': this.insertAtCursor(','); this.updateDisplay(); break;
            case 'abs': this.insertPrefix('abs('); break;
            case 'ans':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('Ans'); this.updateDisplay(); break;
            case 'table': this.openTable(); break;
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
            case 'del':
                if (this.secondFunction) { this.secondFunction = false; }
                else { this.deleteAtCursor(); this.updateDisplay(); }
                break;
            case 'clear':
                if (this.tableMode) this.closeTable();
                else if (this.stoMode || this.rclMode) { this.stoMode = false; this.rclMode = false; this.updateDisplay(); }
                else this.clear();
                break;
            case 'enter': this.handleEnter(); break;
            case 'on': this.reset(); break;
        }
    }

    handleEnter() {
        if (this.stoMode || this.rclMode) { this.selectMemoryRegister(this.memRegCursor + 1); return; }
        if (this.tableMode === 'expr') {
            if (this.tableExpression) { this.tableMode = 'start'; this.currentInput = String(this.tableStart); this.renderTableSetup(); }
            return;
        }
        if (this.tableMode === 'start') {
            this.tableStart = parseFloat(this.currentInput) || 0;
            this.tableMode = 'end'; this.currentInput = String(this.tableEnd); this.renderTableSetup(); return;
        }
        if (this.tableMode === 'end') {
            this.tableEnd = parseFloat(this.currentInput) || 10;
            this.tableMode = 'step'; this.currentInput = String(this.tableStep); this.renderTableSetup(); return;
        }
        if (this.tableMode === 'step') {
            this.tableStep = parseFloat(this.currentInput) || 1;
            if (this.tableStep === 0) this.tableStep = 1;
            this.evaluateTable(); return;
        }
        if (this.tableMode === 'view') { this.closeTable(); return; }
        if (this.menuMode) this.selectMenuItem();
        else if (this.dataEntryMode) this.addDataPoint();
        else if (this.statVarMode) this.displayStatVar();
        else this.calculate();
    }

    handleKeyboard(e) {
        if (this.floatingCalc.style.display === 'none') return;
        const key = e.key;

        if (e.ctrlKey || e.metaKey) {
            if (key === 'c') { this.copyResult(); return; }
            if (key === 'v') return;
            return;
        }

        if (key >= '0' && key <= '9') { this.handleNumber(key); e.preventDefault(); return; }

        const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' };
        if (opMap[key]) { this.handleOperator(opMap[key]); e.preventDefault(); return; }

        switch(key) {
            case 'Enter': this.handleEnter(); e.preventDefault(); break;
            case 'Escape':
                if (this.tableMode) this.closeTable();
                else if (this.stoMode || this.rclMode) { this.stoMode = false; this.rclMode = false; this.updateDisplay(); }
                else this.clear();
                e.preventDefault(); break;
            case 'Backspace':
                if (this.tableMode === 'expr') { this.tableExpression = this.tableExpression.slice(0, -1); this.renderTableSetup(); }
                else if (['start','end','step'].includes(this.tableMode)) { this.currentInput = this.currentInput.slice(0, -1); this.renderTableSetup(); }
                else { this.deleteAtCursor(); this.updateDisplay(); }
                e.preventDefault(); break;
            case 'Delete':
                if (this.cursorPos < this.currentInput.length) { this.moveCursorRight(); this.deleteAtCursor(); this.updateDisplay(); }
                e.preventDefault(); break;
            case '.': this.handleDecimal(); e.preventDefault(); break;
            case '(': this.handleFunction('lparen'); e.preventDefault(); break;
            case ')': this.handleFunction('rparen'); e.preventDefault(); break;
            case '^': this.handleFunction('power'); e.preventDefault(); break;
            case '!': this.handleFunction('factorial'); e.preventDefault(); break;
            case 'p': this.handleFunction('pi'); e.preventDefault(); break;
            case 'a': this.handleFunction('ans'); e.preventDefault(); break;
            case 'x':
                if (this.tableMode === 'expr') { this.tableExpression += 'x'; this.renderTableSetup(); e.preventDefault(); }
                break;
            case 't':
                if (!this.currentInput && !this.tableMode) { this.openTable(); e.preventDefault(); }
                break;
            case 'Tab':
                this.secondFunction = !this.secondFunction;
                this.updateSecondFunctionIndicator(); e.preventDefault(); break;
            case 'Home': this.cursorPos = 0; this.updateDisplay(); e.preventDefault(); break;
            case 'End': this.cursorPos = this.currentInput.length; this.updateDisplay(); e.preventDefault(); break;
            case 'ArrowUp': this.handleArrowUp(); e.preventDefault(); break;
            case 'ArrowDown': this.handleArrowDown(); e.preventDefault(); break;
            case 'ArrowLeft': this.handleArrowLeft(); e.preventDefault(); break;
            case 'ArrowRight': this.handleArrowRight(); e.preventDefault(); break;
        }
    }

    // ==================== ARROW KEYS ====================

    handleArrowUp() {
        if (this.tableMode === 'view') { this.tableScrollIndex = Math.max(0, this.tableScrollIndex - 1); this.renderTableView(); return; }
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.max(0, this.memRegCursor - 1); this.renderMemorySelection(); return; }
        if (this.menuMode) { this.menuCursor = Math.max(0, this.menuCursor - 1); if (this.menuMode === 'STAT') this.showStatMenu(); return; }
        if (this.history.length > 0) {
            if (this.historyIndex < 0) this.historyIndex = this.history.length;
            this.historyIndex = Math.max(0, this.historyIndex - 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay();
        }
    }

    handleArrowDown() {
        if (this.tableMode === 'view') { this.tableScrollIndex = Math.min(this.tableResults.length - 1, this.tableScrollIndex + 1); this.renderTableView(); return; }
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.min(6, this.memRegCursor + 1); this.renderMemorySelection(); return; }
        if (this.menuMode) { this.menuCursor = Math.min(1, this.menuCursor + 1); if (this.menuMode === 'STAT') this.showStatMenu(); return; }
        if (this.dataEntryMode && this.currentInput) { this.addDataPoint(); }
        else if (this.historyIndex >= 0) {
            this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay();
        }
    }

    handleArrowLeft() {
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.max(0, this.memRegCursor - 1); this.renderMemorySelection(); return; }
        if (this.menuMode === 'STAT') { this.menuCursor = 0; this.showStatMenu(); return; }
        if (this.statVarMode) { this.statVarIndex = Math.max(0, this.statVarIndex - 1); this.displayStatVar(); return; }
        this.moveCursorLeft();
        this.updateDisplay();
    }

    handleArrowRight() {
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.min(6, this.memRegCursor + 1); this.renderMemorySelection(); return; }
        if (this.menuMode === 'STAT') { this.menuCursor = 1; this.showStatMenu(); return; }
        if (this.statVarMode) {
            const maxIndex = this.statMode === '2-VAR' ? 12 : 4;
            this.statVarIndex = Math.min(maxIndex, this.statVarIndex + 1);
            this.displayStatVar(); return;
        }
        this.moveCursorRight();
        this.updateDisplay();
    }

    // ==================== TRIG FUNCTIONS ====================

    applyTrigFunction(fn) {
        // Legacy support — trig is now prefix-based via safeEval
        const value = this.getCurrentValue();
        if (value === null) return;
        let result;
        const rad = this.angleMode === 'DEG' ? value * Math.PI / 180 : value;
        switch(fn) {
            case 'sin': result = Math.sin(rad); break;
            case 'cos': result = Math.cos(rad); break;
            case 'tan':
                if (this.angleMode === 'DEG' && value % 180 === 90) { this.showError('DOMAIN'); return; }
                result = Math.tan(rad); break;
            case 'asin':
                if (value < -1 || value > 1) { this.showError('DOMAIN'); return; }
                result = Math.asin(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'acos':
                if (value < -1 || value > 1) { this.showError('DOMAIN'); return; }
                result = Math.acos(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'atan':
                result = Math.atan(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'sinh': result = Math.sinh(value); break;
            case 'cosh': result = Math.cosh(value); break;
            case 'tanh': result = Math.tanh(value); break;
            case 'asinh': result = Math.asinh(value); break;
            case 'acosh':
                if (value < 1) { this.showError('DOMAIN'); return; }
                result = Math.acosh(value); break;
            case 'atanh':
                if (value <= -1 || value >= 1) { this.showError('DOMAIN'); return; }
                result = Math.atanh(value); break;
        }
        if (result !== undefined && !isFinite(result)) { this.showError('OVERFLOW'); return; }
        this.hypMode = false;
        this.hypIndicator.textContent = '';
        this.setResult(result);
    }

    // ==================== MATH FUNCTIONS ====================

    applyFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;
        let result;
        switch(fn) {
            case 'factorial':
                if (value < 0 || !Number.isInteger(value)) { this.showError('DOMAIN'); return; }
                if (value > 170) { this.showError('OVERFLOW'); return; }
                result = this.factorial(value); break;
            case 'percent': result = value / 100; break;
            case 'square': result = value * value; break;
            case 'reciprocal':
                if (value === 0) { this.showError('DIVIDE BY 0'); return; }
                result = 1 / value; break;
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
        if (lastPart === 'Ans') return this.ans;
        if (lastPart === '') return this.lastResult;
        const value = parseFloat(lastPart);
        return isNaN(value) ? this.lastResult : value;
    }

    setResult(value) {
        if (value === undefined || value === null) return;
        this.currentInput = '';
        this.cursorPos = 0;
        this.result = value;
        this.lastResult = value;
        this.resultLine.textContent = this.formatNumber(value);
        this.waitingForOperand = true;
        this.updateDisplay();
    }

    // ==================== DECIMAL / NEGATIVE ====================

    handleDecimal() {
        if (this.waitingForOperand) {
            this.currentInput = '0.'; this.cursorPos = 2; this.waitingForOperand = false;
            this.updateDisplay(); return;
        }
        const before = this.currentInput.slice(0, this.cursorPos);
        const parts = before.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes('.')) {
            this.insertAtCursor(lastPart === '' ? '0.' : '.');
            this.updateDisplay();
        }
    }

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
                this.cursorPos = this.currentInput.length;
            } else {
                if (this.currentInput.startsWith('(-')) this.currentInput = this.currentInput.slice(2, -1);
                else this.currentInput = '(-' + this.currentInput + ')';
                this.cursorPos = this.currentInput.length;
            }
            this.updateDisplay();
        }
    }

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.angleModeDisplay.textContent = this.angleMode;
    }

    // ==================== FRACTION DISPLAY ====================

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

    // ==================== MEMORY REGISTERS ====================

    storeMemory() {
        this.stoMode = true; this.rclMode = false; this.memRegCursor = 0;
        this.renderMemorySelection();
    }

    recallMemory() {
        this.rclMode = true; this.stoMode = false; this.memRegCursor = 0;
        this.renderMemorySelection();
    }

    selectMemoryRegister(regNum) {
        const regKey = 'x' + regNum;
        if (this.stoMode) {
            const value = this.waitingForOperand ? this.lastResult : this.getCurrentValue();
            if (value !== null) {
                this.memoryRegisters[regKey] = value;
                this.memoryIndicator.textContent = 'M';
                this.showMessage(`STO → ${regKey} = ${this.formatNumber(value)}`);
            }
            this.stoMode = false;
        } else if (this.rclMode) {
            const value = this.memoryRegisters[regKey];
            if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
            this.insertAtCursor(String(value));
            this.updateDisplay();
            this.rclMode = false;
        }
    }

    renderMemorySelection() {
        const mode = this.stoMode ? 'STO→' : 'RCL';
        let line1 = `${mode} `;
        for (let i = 0; i < 7; i++) {
            line1 += `${i === this.memRegCursor ? '▸' : ' '}x${i + 1} `;
        }
        const selectedKey = 'x' + (this.memRegCursor + 1);
        this.inputLine.textContent = line1;
        this.inputLine.classList.remove('mathprint');
        this.resultLine.textContent = `${selectedKey} = ${this.formatNumber(this.memoryRegisters[selectedKey])}`;
    }

    // ==================== TABLE FEATURE ====================

    openTable() {
        this.tableMode = 'expr'; this.tableExpression = '';
        this.tableStart = 0; this.tableEnd = 10; this.tableStep = 1;
        this.tableResults = []; this.tableScrollIndex = 0;
        this.renderTableSetup();
    }

    closeTable() {
        this.tableMode = null; this.currentInput = ''; this.cursorPos = 0;
        this.inputLine.classList.add('mathprint');
        this.updateDisplay();
    }

    renderTableSetup() {
        this.inputLine.classList.remove('mathprint');
        if (this.tableMode === 'expr') {
            this.inputLine.textContent = `f(x)= ${this.tableExpression}█`;
            this.resultLine.textContent = 'Enter expression with x';
        } else if (this.tableMode === 'start') {
            this.inputLine.textContent = `TblStart= ${this.currentInput}█`;
            this.resultLine.textContent = `f(x)= ${this.tableExpression}`;
        } else if (this.tableMode === 'end') {
            this.inputLine.textContent = `TblEnd= ${this.currentInput}█`;
            this.resultLine.textContent = `Start= ${this.tableStart}`;
        } else if (this.tableMode === 'step') {
            this.inputLine.textContent = `ΔTbl= ${this.currentInput}█`;
            this.resultLine.textContent = `${this.tableStart} → ${this.tableEnd}`;
        }
    }

    evaluateTable() {
        this.tableResults = [];
        const steps = Math.min(100, Math.abs((this.tableEnd - this.tableStart) / this.tableStep) + 1);
        for (let i = 0; i < steps; i++) {
            const x = this.tableStart + i * this.tableStep;
            if ((this.tableStep > 0 && x > this.tableEnd) || (this.tableStep < 0 && x < this.tableEnd)) break;
            try {
                let expr = this.tableExpression
                    .replace(/x/g, `(${x})`).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
                    .replace(/π/g, `(${Math.PI})`).replace(/\^/g, '**').replace(/x²/g, `(${x})*(${x})`);
                expr = expr.replace(/atanh\(/g, 'Math.atanh(')
                           .replace(/asinh\(/g, 'Math.asinh(')
                           .replace(/acosh\(/g, 'Math.acosh(')
                           .replace(/asin\(/g, 'Math.asin(')
                           .replace(/acos\(/g, 'Math.acos(')
                           .replace(/atan\(/g, 'Math.atan(')
                           .replace(/sinh\(/g, 'Math.sinh(')
                           .replace(/cosh\(/g, 'Math.cosh(')
                           .replace(/tanh\(/g, 'Math.tanh(')
                           .replace(/sin\(/g, 'Math.sin(')
                           .replace(/cos\(/g, 'Math.cos(')
                           .replace(/tan\(/g, 'Math.tan(')
                           .replace(/log\(/g, 'Math.log10(')
                           .replace(/ln\(/g, 'Math.log(')
                           .replace(/abs\(/g, 'Math.abs(')
                           .replace(/√\(/g, 'Math.sqrt(');
                expr = expr.replace(/(\d)\(/g, '$1*(').replace(/\)(\d)/g, ')*$1').replace(/\)\(/g, ')*(');
                const y = new Function('return ' + expr)();
                this.tableResults.push({ x, y: isFinite(y) ? y : NaN });
            } catch(e) { this.tableResults.push({ x, y: NaN }); }
        }
        if (this.tableResults.length === 0) { this.showError('SYNTAX'); this.closeTable(); return; }
        this.tableMode = 'view'; this.tableScrollIndex = 0;
        this.renderTableView();
    }

    renderTableView() {
        this.inputLine.classList.remove('mathprint');
        if (this.tableResults.length === 0) { this.inputLine.textContent = 'No results'; this.resultLine.textContent = ''; return; }
        const rows = [];
        for (let i = this.tableScrollIndex; i < Math.min(this.tableScrollIndex + 2, this.tableResults.length); i++) {
            const r = this.tableResults[i];
            rows.push(`x=${this.formatNumber(r.x)}  f(x)=${isNaN(r.y) ? 'ERR' : this.formatNumber(r.y)}`);
        }
        this.inputLine.textContent = rows[0] || '';
        this.resultLine.textContent = rows[1] || `[${this.tableScrollIndex + 1}/${this.tableResults.length}]`;
        if (this.historyDisplay) {
            const total = this.tableResults.length, pos = this.tableScrollIndex + 1;
            this.historyDisplay.innerHTML = `<div class="history-entry" style="opacity:0.7;justify-content:center;">TABLE: f(x)= ${this.escapeHtml(this.tableExpression)} [${pos}/${total}] ↑↓</div>`;
        }
    }

    // ==================== STATISTICS ====================

    showStatMenu() {
        this.menuMode = 'STAT';
        this.menuCursor = this.statMode === '2-VAR' ? 1 : 0;
        const opts = ['1-VAR', '2-VAR'];
        this.inputLine.textContent = opts.map((o, i) => i === this.menuCursor ? `▸${o}` : ` ${o}`).join('  ');
        this.inputLine.classList.remove('mathprint');
        this.resultLine.textContent = 'Select mode';
    }

    showDataMenu() {
        this.menuMode = 'DATA';
        this.inputLine.textContent = '▸CLRDATA';
        this.inputLine.classList.remove('mathprint');
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
        this.dataEntryMode = true; this.currentInput = ''; this.cursorPos = 0;
        this.currentDataVar = 'x';
        this.showMessage(`DATA ENTRY ${this.statMode}`);
    }

    addDataPoint() {
        if (!this.dataEntryMode) return;
        const value = parseFloat(this.currentInput);
        if (isNaN(value)) { this.showError('DOMAIN'); return; }
        if (this.statMode === '1-VAR') {
            this.statData.x.push(value); this.currentInput = ''; this.cursorPos = 0;
            this.showMessage(`n = ${this.statData.x.length}`);
        } else if (this.statMode === '2-VAR') {
            if (this.currentDataVar === 'x') {
                this.statData.x.push(value); this.currentDataVar = 'y';
                this.currentInput = ''; this.cursorPos = 0; this.showMessage('Enter Y');
            } else {
                this.statData.y.push(value); this.currentDataVar = 'x';
                this.currentInput = ''; this.cursorPos = 0;
                this.showMessage(`n = ${this.statData.x.length}`);
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
        const valueMap = { 'n': this.statData.x.length, 'x̄': stats.xMean, 'Σx': stats.xSum, 'Σx²': stats.xSumSq, 'σx': stats.xStd };
        if (this.statMode === '2-VAR') {
            Object.assign(valueMap, { 'ȳ': stats.yMean, 'Σy': stats.ySum, 'Σy²': stats.ySumSq, 'σy': stats.yStd, 'Σxy': stats.xySum, 'r': stats.r, 'a': stats.intercept, 'b': stats.slope });
        }
        const value = valueMap[varName];
        this.inputLine.textContent = `${varName} =`;
        this.inputLine.classList.remove('mathprint');
        if (value === undefined) { this.resultLine.textContent = 'N/A (2-VAR only)'; }
        else { this.resultLine.textContent = this.formatNumber(value); this.lastResult = value; }
    }

    calculateStatistics() {
        if (!this.statMode || this.statData.x.length === 0) return null;
        const stats = {}, n = this.statData.x.length, xData = this.statData.x;
        const xSum = xData.reduce((a, b) => a + b, 0);
        stats.xSum = xSum; stats.xMean = xSum / n;
        stats.xStd = Math.sqrt(xData.reduce((s, v) => s + Math.pow(v - stats.xMean, 2), 0) / n);
        stats.xSumSq = xData.reduce((s, v) => s + v * v, 0);
        if (this.statMode === '2-VAR' && this.statData.y.length === n) {
            const yData = this.statData.y, ySum = yData.reduce((a, b) => a + b, 0);
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

    // ==================== EXPRESSION EVALUATION ====================

    calculate() {
        if (!this.currentInput) return;
        try {
            let expr = this.currentInput;
            expr = expr.replace(/Ans/g, `(${this.ans})`);
            expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
                .replace(/π/g, `(${Math.PI})`).replace(/\^/g, '**');
            expr = expr.replace(/▸n\/d◂/g, '/');
            expr = expr.replace(/(\d+\.?\d*)E([+\-]?\d+)/g, '($1*Math.pow(10,$2))');
            expr = expr.replace(/(\d+\.?\d*)nCr(\d+\.?\d*)/g, (_, n, r) => this.combination(parseFloat(n), parseFloat(r)));
            expr = expr.replace(/(\d+\.?\d*)nPr(\d+\.?\d*)/g, (_, n, r) => this.permutation(parseFloat(n), parseFloat(r)));

            // Nth roots (before √ conversion)
            expr = expr.replace(/(\d+\.?\d*)ⁿ√\(([^)]+)\)/g, 'Math.pow($2,1/$1)').replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2,1/$1)');

            // √ symbol → sqrt function (safeEval defines it)
            expr = expr.replace(/√(\d+\.?\d*)/g, 'sqrt($1)');
            expr = expr.replace(/√/g, 'sqrt');

            // Implicit multiplication
            const fnPat = '(?:atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs|sqrt)';
            expr = expr.replace(/(\d)\(/g, '$1*(');
            expr = expr.replace(/\)(\d)/g, ')*$1');
            expr = expr.replace(/\)\(/g, ')*(');
            expr = expr.replace(new RegExp('(\\d)(' + fnPat + '\\()', 'g'), '$1*$2');
            expr = expr.replace(new RegExp('\\)(' + fnPat + '\\()', 'g'), ')*$1');

            const result = this.safeEval(expr);
            if (isNaN(result)) { this.showError('SYNTAX'); return; }
            if (!isFinite(result)) {
                this.showError(expr.includes('/0') || expr.includes('/ 0') ? 'DIVIDE BY 0' : 'OVERFLOW');
                return;
            }

            this.history.push({ input: this.currentInput, result });
            this.historyIndex = -1;
            this.result = result;
            this.lastResult = result;
            this.ans = result;
            this.resultLine.textContent = this.formatNumber(result);
            this.waitingForOperand = true;
            this.cursorPos = 0;
            this.renderHistory();
        } catch (error) {
            this.showError('SYNTAX');
        }
    }

    validateExpression() {
        if (!this.currentInput || this.waitingForOperand) {
            this.expressionValid = !this.currentInput;
            this.updateEnterButton(); return;
        }
        const input = this.currentInput;
        let parenBalance = 0;
        for (let i = 0; i < input.length; i++) {
            if (input[i] === '(') parenBalance++;
            else if (input[i] === ')') parenBalance--;
            if (parenBalance < 0) break;
        }
        const lastChar = input.slice(-1);
        const endsWithOp = ['+', '−', '×', '÷', '^', 'E'].includes(lastChar);
        const hasDoubleOp = /[+\−×÷]{2}/.test(input);
        this.expressionValid = parenBalance === 0 && !endsWithOp && !hasDoubleOp;
        this.updateEnterButton();

        if (parenBalance > 0 && this.secondIndicator) {
            this.secondIndicator.textContent = this.secondFunction ? '2ND' : `(×${parenBalance}`;
        } else if (!this.secondFunction && this.secondIndicator) {
            this.secondIndicator.textContent = '';
        }
    }

    updateEnterButton() {
        if (this.enterBtn) {
            this.enterBtn.style.opacity = this.expressionValid || this.waitingForOperand || !this.currentInput ? '1' : '0.6';
        }
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
        // Strip allowed tokens for safety check
        const stripped = expression
            .replace(/Math\.(pow|sqrt|PI|E|sin|cos|tan|log|log10|exp|abs|asin|acos|atan|sinh|cosh|tanh|asinh|acosh|atanh)/g, '')
            .replace(/\b(atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs|sqrt|e)\b/g, '')
            .replace(/\s/g, '');
        if (/[a-df-oq-zA-DF-OQ-Z_$]/.test(stripped)) throw new Error('Invalid');

        const isDeg = this.angleMode === 'DEG';
        try {
            return new Function('isDeg', `
                const _r = isDeg ? Math.PI/180 : 1;
                const _d = isDeg ? 180/Math.PI : 1;
                const sin = (v) => Math.sin(v * _r);
                const cos = (v) => Math.cos(v * _r);
                const tan = (v) => Math.tan(v * _r);
                const asin = (v) => Math.asin(v) * _d;
                const acos = (v) => Math.acos(v) * _d;
                const atan = (v) => Math.atan(v) * _d;
                const sinh = (v) => Math.sinh(v);
                const cosh = (v) => Math.cosh(v);
                const tanh = (v) => Math.tanh(v);
                const asinh = (v) => Math.asinh(v);
                const acosh = (v) => Math.acosh(v);
                const atanh = (v) => Math.atanh(v);
                const log = (v) => Math.log10(v);
                const ln = (v) => Math.log(v);
                const abs = (v) => Math.abs(v);
                const sqrt = (v) => Math.sqrt(v);
                const e = Math.E;
                return ${expression};
            `)(isDeg);
        } catch (err) {
            throw new Error('Invalid');
        }
    }

    // ==================== MATHPRINT RENDERING ====================

    renderMathPrint(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);
        // Function name styling
        html = html.replace(/\b(atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs)\(/g,
            '<span class="mp-fn">$1</span>(');
        html = html.replace(/Ans/g, '<span class="mp-ans">Ans</span>');
        html = html.replace(/(\d+)▸n\/d◂(\d+)/g, '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">$2</span></span>');
        html = html.replace(/(\d+)▸n\/d◂/g, '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">_</span></span>');
        html = html.replace(/▸n\/d◂(\d+)/g, '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">$1</span></span>');
        html = html.replace(/▸n\/d◂/g, '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">_</span></span>');
        html = html.replace(/(\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/g, '$1<span class="mp-sup">$2</span>');
        html = html.replace(/(\d+(?:\.\d+)?)\^/g, '$1<span class="mp-sup">_</span>');
        html = html.replace(/√\(([^)]+)\)/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');
        html = html.replace(/√(\d+\.?\d*)/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');
        html = html.replace(/(\d+)ⁿ√\(([^)]+)\)/g, '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/(\d+)ⁿ√(\d+\.?\d*)/g, '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/ⁿ√/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">_</span></span>');
        return html;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return text.replace(/[&<>"]/g, c => map[c]);
    }

    // ==================== DISPLAY ====================

    renderHistory() {
        if (!this.historyDisplay) return;
        const recent = this.history.slice(-2);
        this.historyDisplay.innerHTML = recent.map(entry =>
            `<div class="history-entry"><div class="history-input">${this.escapeHtml(entry.input)}</div><div class="history-result">${this.formatNumber(entry.result)}</div></div>`
        ).join('');
    }

    formatNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return 'ERROR';
        if (Math.abs(num) < 1e-10 && num !== 0) return num.toExponential(6);
        if (Math.abs(num) > 9999999999) return num.toExponential(6);
        const rounded = Math.round(num * 1e10) / 1e10;
        const str = rounded.toString();
        if (str.replace(/[.\-]/g, '').length > 10) return num.toPrecision(10);
        return str;
    }

    showError(type) {
        const messages = { 'SYNTAX': 'SYNTAX ERROR', 'DOMAIN': 'DOMAIN ERROR', 'DIVIDE BY 0': 'DIVIDE BY 0', 'OVERFLOW': 'OVERFLOW', 'ARGUMENT': 'ARGUMENT ERROR' };
        this.resultLine.textContent = messages[type] || type;
        this.resultLine.classList.add('error');
        setTimeout(() => {
            this.resultLine.classList.remove('error');
            this.resultLine.textContent = '0';
            this.currentInput = ''; this.cursorPos = 0;
            this.waitingForOperand = false;
            this.updateDisplay();
        }, 2000);
    }

    showMessage(message) {
        this.inputLine.textContent = message;
        this.inputLine.classList.remove('mathprint');
        setTimeout(() => {
            if (!this.dataEntryMode && !this.statVarMode && !this.tableMode && !this.stoMode && !this.rclMode) {
                this.inputLine.classList.add('mathprint');
                this.updateDisplay();
            }
        }, 1500);
    }

    updateDisplay() {
        if (this.stoMode || this.rclMode) return;
        if (this.tableMode) return;

        if (this.currentInput) {
            const cursorAtEnd = this.cursorPos >= this.currentInput.length;
            if (cursorAtEnd) {
                this.inputLine.innerHTML = this.renderMathPrint(this.currentInput) + '<span class="cursor"></span>';
            } else {
                const left = this.currentInput.slice(0, this.cursorPos);
                const right = this.currentInput.slice(this.cursorPos);
                this.inputLine.innerHTML = this.escapeHtml(left) + '<span class="cursor"></span>' + this.escapeHtml(right);
            }
            this.inputLine.classList.add('mathprint');
        } else {
            this.inputLine.innerHTML = this.waitingForOperand ? '' : '<span class="cursor"></span>';
            this.inputLine.classList.add('mathprint');
        }
        if (!this.waitingForOperand && !this.currentInput) {
            this.resultLine.textContent = '0';
        }
        this.validateExpression();
    }

    clear() {
        this.currentInput = ''; this.cursorPos = 0;
        this.waitingForOperand = false; this.dataEntryMode = false;
        this.currentDataVar = 'x'; this.menuMode = null;
        this.statVarMode = false; this.stoMode = false; this.rclMode = false;
        this.resultLine.textContent = '0';
        this.resultLine.classList.remove('error');
        this.updateDisplay();
    }

    reset() {
        this.currentInput = ''; this.cursorPos = 0;
        this.result = 0; this.lastResult = 0; this.memory = 0; this.ans = 0;
        this.waitingForOperand = false; this.secondFunction = false;
        this.hypMode = false; this.fractionMode = false;
        this.statMode = null; this.statData = { x: [], y: [] };
        this.dataEntryMode = false; this.currentDataVar = 'x';
        this.menuMode = null; this.statVarMode = false;
        this.stoMode = false; this.rclMode = false;
        this.history = []; this.historyIndex = -1;
        this.tableMode = null;
        for (let i = 1; i <= 7; i++) this.memoryRegisters['x' + i] = 0;
        this.memoryIndicator.textContent = '';
        this.hypIndicator.textContent = '';
        this.angleModeDisplay.textContent = 'DEG'; this.angleMode = 'DEG';
        this.resultLine.textContent = '0';
        this.resultLine.classList.remove('error');
        if (this.historyDisplay) this.historyDisplay.innerHTML = '';
        if (this.secondIndicator) this.secondIndicator.textContent = '';
        this.updateDisplay();
        this.updateSecondFunctionIndicator();
    }

    updateSecondFunctionIndicator() {
        const btn2nd = this.floatingCalc.querySelector('[data-action="2nd"]');
        if (btn2nd) {
            btn2nd.style.background = this.secondFunction
                ? 'linear-gradient(145deg, #f39c12, #e67e22)'
                : 'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
        if (this.secondIndicator) {
            this.secondIndicator.textContent = this.secondFunction ? '2ND' : '';
        }
    }

    // ==================== COPY/PASTE ====================

    createCopyToast() {
        if (!this.floatingCalc) return;
        this.copyToast = document.createElement('div');
        this.copyToast.className = 'copy-toast';
        this.copyToast.textContent = 'Copied!';
        this.floatingCalc.appendChild(this.copyToast);
    }

    setupCopyPaste() {
        if (!this.resultLine) return;
        this.resultLine.addEventListener('click', () => this.copyResult());
        this.resultLine.style.cursor = 'pointer';
        this.resultLine.title = 'Click to copy';

        document.addEventListener('paste', (e) => {
            if (this.floatingCalc.style.display === 'none') return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (text) { this.handlePaste(text); e.preventDefault(); }
        });
    }

    copyResult() {
        const text = this.resultLine.textContent;
        if (!text || text === '0' || text.includes('ERROR')) return;
        navigator.clipboard.writeText(text).then(() => this.showCopyToast()).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            this.showCopyToast();
        });
    }

    showCopyToast() {
        if (!this.copyToast) return;
        this.copyToast.classList.add('visible');
        clearTimeout(this._copyToastTimeout);
        this._copyToastTimeout = setTimeout(() => this.copyToast.classList.remove('visible'), 1200);
    }

    handlePaste(text) {
        const cleaned = text.replace(/[^0-9a-z+\-*/().^πeE,√]/gi, '')
            .replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
        if (!cleaned) return;
        if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
        this.insertAtCursor(cleaned);
        this.updateDisplay();
    }

    // ==================== MOBILE TOUCH ====================

    setupMobileTouch() {
        if (!this.floatingCalc) return;
        this.floatingCalc.style.touchAction = 'manipulation';
        this.floatingCalc.style.userSelect = 'none';
        this.floatingCalc.style.webkitUserSelect = 'none';

        this.floatingCalc.querySelectorAll('.calc-btn').forEach(btn => {
            btn.style.touchAction = 'manipulation';
            btn.addEventListener('touchstart', () => {
                if (navigator.vibrate) navigator.vibrate(10);
            }, { passive: true });
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.floatingCalc = new FloatingCalculator();
});
