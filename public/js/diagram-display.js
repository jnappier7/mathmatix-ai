/**
 * DIAGRAM DISPLAY HANDLER
 * Parses diagram commands from AI responses and displays them inline
 * Format: [DIAGRAM:type:param1=value1,param2=value2]
 * Display: Inline in chat with click-to-enlarge
 */

class DiagramDisplay {
    constructor() {
        this.setupModal();
    }

    /**
     * Parse diagram commands from AI message
     * Returns array of diagram specifications
     */
    parseDiagramCommands(message) {
        const commands = [];
        const regex = /\[DIAGRAM:(\w+):([^\]]+)\]/g;
        let match;

        while ((match = regex.exec(message)) !== null) {
            const type = match[1];
            const paramsStr = match[2];

            // Parse parameters with support for nested objects and arrays
            const params = this.parseParams(paramsStr);

            commands.push({
                fullMatch: match[0],
                type,
                params
            });
        }

        return commands;
    }

    /**
     * Parse parameter string with support for nested objects and arrays
     * Handles: "a=1,b=2,obj={x:1,y:2},arr=[{x:1}]"
     */
    parseParams(paramsStr) {
        const params = {};
        const pairs = this.splitTopLevel(paramsStr, ',');

        for (const pair of pairs) {
            const eqIndex = pair.indexOf('=');
            if (eqIndex === -1) continue;

            const key = pair.substring(0, eqIndex).trim();
            const value = pair.substring(eqIndex + 1).trim();

            if (key && value) {
                params[key] = this.parseValue(value);
            }
        }

        return params;
    }

    /**
     * Split string by delimiter, but only at top level (not inside braces/brackets)
     */
    splitTopLevel(str, delimiter) {
        const result = [];
        let current = '';
        let depth = 0;
        let inQuote = false;
        let quoteChar = '';

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const prevChar = i > 0 ? str[i - 1] : '';

            // Handle quotes
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (char === quoteChar) {
                    inQuote = false;
                }
            }

            if (!inQuote) {
                // Track nesting
                if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                }

                // Split at delimiter when at top level
                if (char === delimiter && depth === 0) {
                    if (current.trim()) {
                        result.push(current);
                    }
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        // Add final segment
        if (current.trim()) {
            result.push(current);
        }

        return result;
    }

    /**
     * Parse a value (handles objects, arrays, numbers, booleans, strings)
     */
    parseValue(value) {
        value = value.trim();

        // Handle objects and arrays - convert to valid JSON and parse
        if ((value.startsWith('{') && value.endsWith('}')) ||
            (value.startsWith('[') && value.endsWith(']'))) {
            try {
                // Convert JavaScript object notation to JSON
                // First, evaluate any arithmetic expressions (e.g., -2/3 -> -0.666...)
                let processedValue = this.evaluateArithmetic(value);

                // Replace unquoted keys with quoted keys
                let jsonStr = processedValue.replace(/(\w+):/g, '"$1":');
                // Replace single quotes with double quotes
                jsonStr = jsonStr.replace(/'/g, '"');
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error('[DiagramDisplay] Failed to parse object/array:', value, e);
                return value;
            }
        }

        // Handle booleans
        if (value === 'true') return true;
        if (value === 'false') return false;

        // Handle numbers (including fractions like -2/3)
        if (!isNaN(value) && value !== '') return parseFloat(value);

        // Handle arithmetic expressions (e.g., -2/3)
        const evaluated = this.evaluateSimpleArithmetic(value);
        if (evaluated !== null) return evaluated;

        // Handle strings (remove quotes if present)
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.substring(1, value.length - 1);
        }

        return value;
    }

    /**
     * Evaluate simple arithmetic expressions in a string
     * Handles expressions like: -2/3, 1/2, 5*2, etc.
     */
    evaluateArithmetic(str) {
        // Match patterns like: -2/3, 1/2, 3*4, 5+2, etc.
        // This regex finds number op number patterns
        return str.replace(/(-?\d+(?:\.\d+)?)\s*([\/*+\-])\s*(-?\d+(?:\.\d+)?)/g, (match, num1, op, num2) => {
            const n1 = parseFloat(num1);
            const n2 = parseFloat(num2);

            switch (op) {
                case '/': return n1 / n2;
                case '*': return n1 * n2;
                case '+': return n1 + n2;
                case '-': return n1 - n2;
                default: return match;
            }
        });
    }

    /**
     * Evaluate a simple arithmetic expression (for standalone values)
     */
    evaluateSimpleArithmetic(value) {
        // Check if it matches a simple arithmetic pattern
        const match = value.match(/^(-?\d+(?:\.\d+)?)\s*([\/*+\-])\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;

        const n1 = parseFloat(match[1]);
        const op = match[2];
        const n2 = parseFloat(match[3]);

        switch (op) {
            case '/': return n1 / n2;
            case '*': return n1 * n2;
            case '+': return n1 + n2;
            case '-': return n1 - n2;
            default: return null;
        }
    }

    /**
     * Generate diagram and return as data URL
     */
    async generateDiagram(type, params) {
        try {
            console.log(`[DiagramDisplay] Generating ${type} diagram with params:`, params);

            // Get CSRF token (from global csrf.js)
            const csrfToken = typeof getCsrfToken === 'function' ? getCsrfToken() : null;

            const headers = {
                'Content-Type': 'application/json'
            };

            // Add CSRF token if available
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            } else {
                console.warn('[DiagramDisplay] No CSRF token found. Request may be rejected.');
            }

            const response = await fetch('/api/generate-diagram', {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify({ type, params })
            });

            if (!response.ok) {
                const error = await response.json();
                console.error(`[DiagramDisplay] Server returned error:`, error);
                throw new Error(error.error || 'Failed to generate diagram');
            }

            const data = await response.json();
            console.log(`[DiagramDisplay] Successfully generated ${type} diagram`);
            return data.image; // data:image/png;base64,...

        } catch (error) {
            console.error('[DiagramDisplay] Error generating diagram:', error);
            console.error('[DiagramDisplay] Type:', type, 'Params:', params);
            return null;
        }
    }

    /**
     * Process AI message and replace diagram commands with inline images
     * Returns modified HTML with diagrams embedded
     */
    async processMessage(message) {
        const commands = this.parseDiagramCommands(message);

        if (commands.length === 0) {
            return message; // No diagrams to process
        }

        console.log(`[DiagramDisplay] Found ${commands.length} diagram commands:`, commands);

        let processedMessage = message;

        // Generate each diagram
        for (const command of commands) {
            console.log(`[DiagramDisplay] Processing command:`, {
                type: command.type,
                params: command.params,
                fullMatch: command.fullMatch
            });

            const imageUrl = await this.generateDiagram(command.type, command.params);

            if (imageUrl) {
                // Create inline diagram HTML
                const diagramHTML = this.createDiagramHTML(imageUrl, command.type, command.params);
                // Replace command with diagram
                processedMessage = processedMessage.replace(command.fullMatch, diagramHTML);
                console.log(`[DiagramDisplay] Successfully replaced diagram command for ${command.type}`);
            } else {
                // If generation failed, show error message
                console.error(`[DiagramDisplay] Failed to generate diagram for ${command.type}`);
                const errorHTML = `<div class="diagram-error">⚠️ Could not generate ${command.type} diagram</div>`;
                processedMessage = processedMessage.replace(command.fullMatch, errorHTML);
            }
        }

        return processedMessage;
    }

    /**
     * Create HTML for inline diagram with click-to-enlarge
     */
    createDiagramHTML(imageUrl, type, params) {
        const diagramId = `diagram-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return `
        <div class="inline-diagram" data-diagram-id="${diagramId}">
            <img
                src="${imageUrl}"
                alt="${type} diagram"
                class="diagram-image"
                onclick="window.diagramDisplay.enlargeDiagram('${imageUrl}', '${type}')"
                title="Click to enlarge"
            />
            <div class="diagram-caption">${this.getCaption(type)}</div>
        </div>
        `;
    }

    /**
     * Get friendly caption for diagram type
     */
    getCaption(type) {
        const captions = {
            parabola: '📊 Parabola',
            triangle: '📐 Triangle',
            number_line: '🔢 Number Line',
            coordinate_plane: '📍 Coordinate Plane',
            angle: '📐 Angle'
        };
        return captions[type] || type;
    }

    /**
     * Enlarge diagram in modal
     */
    enlargeDiagram(imageUrl, type) {
        const modal = document.getElementById('diagram-modal');
        const modalImg = document.getElementById('diagram-modal-img');
        const modalCaption = document.getElementById('diagram-modal-caption');

        modal.style.display = 'flex';
        modalImg.src = imageUrl;
        modalCaption.textContent = this.getCaption(type);
    }

    /**
     * Setup modal for enlarged diagrams
     */
    setupModal() {
        // Check if modal already exists
        if (document.getElementById('diagram-modal')) {
            return;
        }

        // Create modal HTML
        const modalHTML = `
        <div id="diagram-modal" class="diagram-modal" onclick="this.style.display='none'">
            <div class="diagram-modal-content">
                <span class="diagram-modal-close" onclick="document.getElementById('diagram-modal').style.display='none'">&times;</span>
                <img id="diagram-modal-img" class="diagram-modal-img" alt="Enlarged diagram">
                <div id="diagram-modal-caption" class="diagram-modal-caption"></div>
            </div>
        </div>
        `;

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add CSS
        this.addStyles();
    }

    /**
     * Add inline CSS for diagrams and modal
     */
    addStyles() {
        if (document.getElementById('diagram-display-styles')) {
            return;
        }

        const styles = `
        <style id="diagram-display-styles">
            /* Inline Diagram Styles */
            .inline-diagram {
                display: inline-block;
                margin: 15px 0;
                background: #f9f9f9;
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 100%;
                text-align: center;
            }

            .diagram-image {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.2s ease;
            }

            .diagram-image:hover {
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }

            .diagram-caption {
                margin-top: 10px;
                font-size: 14px;
                font-weight: 600;
                color: #667eea;
            }

            .diagram-error {
                color: #e74c3c;
                background: #fee;
                padding: 10px;
                border-radius: 8px;
                font-size: 14px;
                margin: 10px 0;
            }

            /* Modal Styles */
            .diagram-modal {
                display: none;
                position: fixed;
                z-index: 10000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.9);
                align-items: center;
                justify-content: center;
            }

            .diagram-modal-content {
                position: relative;
                max-width: 90%;
                max-height: 90%;
            }

            .diagram-modal-img {
                max-width: 100%;
                max-height: 85vh;
                border-radius: 8px;
            }

            .diagram-modal-caption {
                text-align: center;
                color: #fff;
                font-size: 18px;
                font-weight: bold;
                padding: 20px;
            }

            .diagram-modal-close {
                position: absolute;
                top: -40px;
                right: 0;
                color: #fff;
                font-size: 40px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10001;
            }

            .diagram-modal-close:hover {
                color: #f1f1f1;
            }

            /* Mobile Responsive */
            @media (max-width: 768px) {
                .inline-diagram {
                    max-width: 100%;
                    padding: 10px;
                }

                .diagram-modal-content {
                    max-width: 95%;
                }

                .diagram-modal-img {
                    max-height: 80vh;
                }
            }
        </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// Initialize global instance
window.diagramDisplay = new DiagramDisplay();

console.log('✅ Diagram Display System loaded');
