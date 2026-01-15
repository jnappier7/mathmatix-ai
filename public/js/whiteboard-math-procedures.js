// ============================================
// MATH PROCEDURES MODULE
// High-level commands for common math operations
// Long division, multiplication, fractions, equations, etc.
// ============================================

class MathProcedures {
    constructor(whiteboard, enhancer) {
        this.whiteboard = whiteboard;
        this.enhancer = enhancer;

        // Color scheme
        this.colors = {
            given: '#3b82f6',      // Blue - given numbers
            working: '#f59e0b',    // Amber - intermediate calculations
            result: '#10b981',     // Green - final answer
            carry: '#ef4444',      // Red - carries/borrows
            neutral: '#2d3748',    // Dark gray - labels
            emphasis: '#8b5cf6'    // Purple - emphasis
        };

        console.log('🔢 Math Procedures Module initialized');
    }

    // ============================================
    // LONG DIVISION
    // ============================================

    /**
     * Animated long division: 342 ÷ 6 = ?
     * @param {number} dividend - Number being divided (342)
     * @param {number} divisor - Number dividing by (6)
     */
    async showLongDivision(dividend, divisor) {
        const region = this.enhancer.getAvailableRegion('topCenter');
        if (!region) {
            console.warn('[MathProc] No available region');
            return;
        }

        const startX = region.x + 50;
        const startY = region.y + 30;

        console.log(`🔢 Long Division: ${dividend} ÷ ${divisor}`);

        // Draw division bracket
        await this.drawDivisionBracket(startX, startY, dividend.toString(), divisor);
        await this.delay(500);

        // Perform division step by step
        const dividendStr = dividend.toString();
        const quotientDigits = [];
        let remainder = 0;
        let currentPosition = 0;
        let yOffset = startY + 40;

        for (let i = 0; i < dividendStr.length; i++) {
            // Build current number
            const currentNum = remainder * 10 + parseInt(dividendStr[i]);

            if (currentNum >= divisor) {
                // Calculate quotient digit
                const quotientDigit = Math.floor(currentNum / divisor);
                quotientDigits.push(quotientDigit);

                // Write quotient digit above
                await this.addText(
                    startX + 60 + (quotientDigits.length - 1) * 20,
                    startY - 15,
                    quotientDigit.toString(),
                    this.colors.result,
                    22
                );
                await this.delay(400);

                // Show multiplication
                const product = quotientDigit * divisor;
                await this.addText(
                    startX + 10,
                    yOffset,
                    `${product}`,
                    this.colors.working,
                    18
                );
                await this.delay(300);

                // Draw subtraction line
                await this.drawLine(
                    startX + 5,
                    yOffset + 20,
                    startX + 40,
                    yOffset + 20,
                    this.colors.neutral
                );
                await this.delay(200);

                // Calculate and show remainder
                remainder = currentNum - product;
                await this.addText(
                    startX + 15,
                    yOffset + 25,
                    remainder.toString(),
                    this.colors.carry,
                    18
                );
                await this.delay(400);

                yOffset += 40;
            } else {
                remainder = currentNum;
                if (quotientDigits.length > 0) {
                    quotientDigits.push(0);
                    await this.addText(
                        startX + 60 + (quotientDigits.length - 1) * 20,
                        startY - 15,
                        '0',
                        this.colors.result,
                        22
                    );
                }
            }

            // Bring down next digit (if not last)
            if (i < dividendStr.length - 1) {
                await this.drawArrow(
                    startX + 60 + (i + 1) * 15,
                    startY + 15,
                    startX + 20,
                    yOffset - 5,
                    this.colors.emphasis
                );
                await this.delay(300);
            }
        }

        // Final answer emphasis
        if (remainder === 0) {
            await this.addText(
                startX,
                yOffset + 20,
                `Answer: ${quotientDigits.join('')}`,
                this.colors.result,
                20
            );
        } else {
            await this.addText(
                startX,
                yOffset + 20,
                `Answer: ${quotientDigits.join('')} R${remainder}`,
                this.colors.result,
                20
            );
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Long division complete');
    }

    /**
     * Draw division bracket and initial numbers
     */
    async drawDivisionBracket(x, y, dividend, divisor) {
        // Divisor (outside)
        await this.addText(x, y, divisor.toString(), this.colors.given, 22);
        await this.delay(200);

        // Division symbol (bracket)
        await this.drawLine(x + 40, y, x + 40, y + 30, this.colors.neutral, 2);
        await this.drawLine(x + 40, y, x + 100, y, this.colors.neutral, 2);
        await this.delay(200);

        // Dividend (inside)
        await this.addText(x + 60, y + 5, dividend, this.colors.given, 22);
        await this.delay(300);
    }

    // ============================================
    // VERTICAL MULTIPLICATION
    // ============================================

    /**
     * Animated vertical multiplication: 23 × 47
     * @param {number} num1 - First number
     * @param {number} num2 - Second number
     */
    async showVerticalMultiplication(num1, num2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 70;
        const startY = region.y + 30;

        console.log(`🔢 Vertical Multiplication: ${num1} × ${num2}`);

        // Write first number (right-aligned)
        await this.addText(startX, startY, num1.toString(), this.colors.given, 24);
        await this.delay(300);

        // Write multiplication symbol and second number
        await this.addText(startX - 20, startY + 30, '×', this.colors.neutral, 24);
        await this.addText(startX, startY + 30, num2.toString(), this.colors.given, 24);
        await this.delay(300);

        // Draw line
        await this.drawLine(startX - 25, startY + 55, startX + 80, startY + 55, this.colors.neutral, 2);
        await this.delay(400);

        // Calculate and show partial products
        const num2Str = num2.toString();
        const partialProducts = [];
        let yOffset = startY + 65;

        for (let i = num2Str.length - 1; i >= 0; i--) {
            const digit = parseInt(num2Str[i]);
            const place = num2Str.length - 1 - i;

            // Calculate partial product
            let partialProduct = num1 * digit;
            let carry = 0;

            // Show carries if any
            const product = num1 * digit;
            if (product >= 10) {
                const carryDigits = Math.floor(product / 10).toString();
                await this.addText(
                    startX + 10,
                    startY + 30 - 15,
                    carryDigits,
                    this.colors.carry,
                    14
                );
                await this.delay(200);
            }

            // Show partial product (with proper place value - add zeros)
            const partialWithZeros = partialProduct * Math.pow(10, place);
            partialProducts.push(partialWithZeros);

            await this.addText(
                startX - (place * 15),
                yOffset,
                partialWithZeros.toString(),
                this.colors.working,
                22
            );
            await this.delay(500);

            yOffset += 35;
        }

        // Draw final line
        await this.drawLine(startX - 25, yOffset - 5, startX + 80, yOffset - 5, this.colors.neutral, 2);
        await this.delay(300);

        // Calculate and show final sum
        const finalAnswer = partialProducts.reduce((a, b) => a + b, 0);
        await this.addText(startX, yOffset + 5, finalAnswer.toString(), this.colors.result, 26);
        await this.delay(300);

        // Box the answer
        if (this.whiteboard.handwriting) {
            await this.whiteboard.handwriting.drawHandDrawnCircle(
                startX + 40,
                yOffset + 15,
                35,
                { color: this.colors.result, strokeWidth: 3 }
            );
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Vertical multiplication complete');
    }

    // ============================================
    // FRACTION ADDITION
    // ============================================

    /**
     * Animated fraction addition: 3/4 + 1/6
     * @param {number} n1 - First numerator
     * @param {number} d1 - First denominator
     * @param {number} n2 - Second numerator
     * @param {number} d2 - Second denominator
     */
    async showFractionAddition(n1, d1, n2, d2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 50;
        const startY = region.y + 50;

        console.log(`🔢 Fraction Addition: ${n1}/${d1} + ${n2}/${d2}`);

        // Original fractions
        await this.drawFraction(startX, startY, n1, d1, this.colors.given);
        await this.delay(300);

        await this.addText(startX + 40, startY + 10, '+', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 60, startY, n2, d2, this.colors.given);
        await this.delay(500);

        // Find LCD
        const lcd = this.findLCM(d1, d2);
        await this.addText(
            startX,
            startY + 50,
            `Common denominator: ${lcd}`,
            this.colors.working,
            16
        );
        await this.delay(500);

        // Convert fractions
        const newN1 = n1 * (lcd / d1);
        const newN2 = n2 * (lcd / d2);

        await this.addText(startX, startY + 75, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 65, newN1, lcd, this.colors.working);
        await this.delay(300);

        await this.addText(startX + 70, startY + 75, '+', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 90, startY + 65, newN2, lcd, this.colors.working);
        await this.delay(500);

        // Add numerators
        const finalN = newN1 + newN2;

        await this.addText(startX, startY + 125, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 115, finalN, lcd, this.colors.result, 26);
        await this.delay(300);

        // Simplify if possible
        const gcd = this.findGCD(finalN, lcd);
        if (gcd > 1) {
            const simplifiedN = finalN / gcd;
            const simplifiedD = lcd / gcd;

            await this.addText(
                startX + 100,
                startY + 125,
                `= ${simplifiedN}/${simplifiedD}`,
                this.colors.result,
                20
            );
            await this.delay(300);

            // Circle simplified answer
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 130,
                    startY + 125,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Fraction addition complete');
    }

    /**
     * Draw a fraction (numerator over denominator)
     */
    async drawFraction(x, y, numerator, denominator, color = '#2d3748', fontSize = 20) {
        // Numerator
        await this.addText(x, y, numerator.toString(), color, fontSize);

        // Fraction bar
        await this.drawLine(x - 5, y + 20, x + 30, y + 20, color, 2);

        // Denominator
        await this.addText(x, y + 25, denominator.toString(), color, fontSize);
    }

    // ============================================
    // EQUATION SOLVING
    // ============================================

    /**
     * Animated equation solving: 2x + 3 = 11
     * @param {string} equation - Equation string (e.g., "2x+3=11")
     */
    async solveEquation(equation) {
        const region = this.enhancer.getAvailableRegion('topCenter');
        if (!region) return;

        const startX = region.x + 50;
        let yPos = region.y + 30;

        console.log(`🔢 Solving Equation: ${equation}`);

        // Parse equation (simple linear: ax + b = c)
        const match = equation.match(/(\d*)x\s*([+-])\s*(\d+)\s*=\s*(\d+)/);
        if (!match) {
            console.warn('[MathProc] Could not parse equation:', equation);
            return;
        }

        const a = match[1] ? parseInt(match[1]) : 1;
        const sign = match[2];
        const b = parseInt(match[3]);
        const c = parseInt(match[4]);
        const bValue = sign === '+' ? b : -b;

        // Step 1: Write original equation
        await this.addText(startX, yPos, equation, this.colors.given, 24);
        await this.delay(500);
        yPos += 40;

        // Step 2: Subtract/add b from both sides
        const stepDescription = bValue > 0 ? `Subtract ${bValue}` : `Add ${Math.abs(bValue)}`;
        await this.addText(startX + 150, yPos - 40, `← ${stepDescription}`, this.colors.working, 14);
        await this.delay(400);

        const cMinusB = c - bValue;
        const step2 = `${a === 1 ? '' : a}x = ${cMinusB}`;
        await this.addText(startX, yPos, step2, this.colors.working, 24);
        await this.delay(500);
        yPos += 40;

        // Step 3: Divide by coefficient
        if (a !== 1) {
            await this.addText(startX + 150, yPos - 40, `← Divide by ${a}`, this.colors.working, 14);
            await this.delay(400);

            const x = cMinusB / a;
            const step3 = `x = ${x}`;
            await this.addText(startX, yPos, step3, this.colors.result, 26);
            await this.delay(500);

            // Box the answer
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 30,
                    yPos + 5,
                    25,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Equation solving complete');
    }

    // ============================================
    // FRACTION MULTIPLICATION
    // ============================================

    /**
     * Animated fraction multiplication: 2/3 × 3/4
     * @param {number} n1 - First numerator
     * @param {number} d1 - First denominator
     * @param {number} n2 - Second numerator
     * @param {number} d2 - Second denominator
     */
    async showFractionMultiplication(n1, d1, n2, d2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 50;
        const startY = region.y + 50;

        console.log(`🔢 Fraction Multiplication: ${n1}/${d1} × ${n2}/${d2}`);

        // Original fractions
        await this.drawFraction(startX, startY, n1, d1, this.colors.given);
        await this.delay(300);

        await this.addText(startX + 40, startY + 10, '×', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 60, startY, n2, d2, this.colors.given);
        await this.delay(500);

        // Multiply numerators and denominators
        const resultN = n1 * n2;
        const resultD = d1 * d2;

        await this.addText(startX, startY + 75, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 65, resultN, resultD, this.colors.working, 22);
        await this.delay(500);

        // Simplify
        const gcd = this.findGCD(resultN, resultD);
        if (gcd > 1) {
            const simplifiedN = resultN / gcd;
            const simplifiedD = resultD / gcd;

            await this.addText(
                startX + 90,
                startY + 75,
                `= ${simplifiedN}/${simplifiedD}`,
                this.colors.result,
                22
            );
            await this.delay(300);

            // Circle answer
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 120,
                    startY + 75,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        } else {
            // Already simplified
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 40,
                    startY + 75,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Fraction multiplication complete');
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Add text to canvas
     */
    async addText(x, y, text, color = '#2d3748', fontSize = 18) {
        const textObj = new fabric.Text(text, {
            left: x,
            top: y,
            fontSize: fontSize,
            fill: color,
            fontFamily: 'Indie Flower, cursive',
            selectable: false
        });

        this.whiteboard.canvas.add(textObj);
        this.whiteboard.canvas.renderAll();
        return textObj;
    }

    /**
     * Draw a line
     */
    async drawLine(x1, y1, x2, y2, color = '#2d3748', strokeWidth = 2) {
        const line = new fabric.Line([x1, y1, x2, y2], {
            stroke: color,
            strokeWidth: strokeWidth,
            selectable: false,
            strokeLineCap: 'round'
        });

        this.whiteboard.canvas.add(line);
        this.whiteboard.canvas.renderAll();
        return line;
    }

    /**
     * Draw arrow
     */
    async drawArrow(x1, y1, x2, y2, color = '#12B3B3') {
        if (this.whiteboard.handwriting) {
            return this.whiteboard.handwriting.drawHandDrawnArrow(x1, y1, x2, y2, {
                color: color,
                strokeWidth: 2,
                wobbleIntensity: 0.02
            });
        }
    }

    /**
     * Find GCD (Greatest Common Divisor)
     */
    findGCD(a, b) {
        return b === 0 ? a : this.findGCD(b, a % b);
    }

    /**
     * Find LCM (Least Common Multiple)
     */
    findLCM(a, b) {
        return (a * b) / this.findGCD(a, b);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const checkDependencies = setInterval(() => {
        if (window.whiteboard && window.whiteboardEnhancer) {
            window.mathProcedures = new MathProcedures(window.whiteboard, window.whiteboardEnhancer);
            clearInterval(checkDependencies);
            console.log('✅ Math Procedures Module initialized');
        }
    }, 100);

    setTimeout(() => clearInterval(checkDependencies), 10000);
});

console.log('🔢 Math Procedures Module loaded');
