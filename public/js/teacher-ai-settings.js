// teacher-ai-settings.js
// Class AI Settings modal functionality

document.addEventListener('DOMContentLoaded', () => {
    const aiSettingsBtn = document.getElementById('qa-ai-settings');
    let currentSettings = null;

    // Open AI Settings modal
    if (aiSettingsBtn) {
        aiSettingsBtn.addEventListener('click', openAISettingsModal);
    }

    async function openAISettingsModal() {
        // Fetch current settings
        try {
            const response = await fetch('/api/teacher/class-ai-settings', {
                credentials: 'include'
            });
            const data = await response.json();
            currentSettings = data.settings || {};
        } catch (error) {
            console.error('Error fetching AI settings:', error);
            currentSettings = {};
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'ai-settings-modal';
        modal.className = 'modal-overlay ai-settings-modal is-visible';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close-button" id="close-ai-settings">&times;</span>
                <h2><i class="fas fa-robot" style="color: #27ae60;"></i> Class AI Settings</h2>
                <p style="color: #666; margin-bottom: 24px;">Configure how the AI tutor interacts with your students. These settings apply to all students in your class.</p>

                <!-- Calculator Access -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-calculator"></i> Calculator Access</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>When can students use calculators?</label>
                            <select id="calculator-access">
                                <option value="skill-based" ${currentSettings.calculatorAccess === 'skill-based' ? 'selected' : ''}>Skill-Based (AI decides per problem)</option>
                                <option value="always" ${currentSettings.calculatorAccess === 'always' ? 'selected' : ''}>Always Available</option>
                                <option value="never" ${currentSettings.calculatorAccess === 'never' ? 'selected' : ''}>Never Available</option>
                                <option value="teacher-discretion" ${currentSettings.calculatorAccess === 'teacher-discretion' ? 'selected' : ''}>Only When I Specify</option>
                            </select>
                            <p class="setting-hint">Skill-based allows calculators for computation-heavy problems but not basic arithmetic practice</p>
                        </div>
                        <div class="setting-group">
                            <label>Additional Notes</label>
                            <input type="text" id="calculator-note" placeholder="e.g., Allow for word problems only" value="${currentSettings.calculatorNote || ''}">
                        </div>
                    </div>
                </div>

                <!-- Scaffolding Level -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-layer-group"></i> Scaffolding Level</h3>
                    <div class="setting-group">
                        <label>How much support should the AI provide?</label>
                        <div class="scaffolding-slider">
                            <span>Less</span>
                            <input type="range" id="scaffolding-level" min="1" max="5" value="${currentSettings.scaffoldingLevel || 3}">
                            <span>More</span>
                        </div>
                        <div class="scaffolding-labels">
                            <span>Minimal hints</span>
                            <span>Balanced</span>
                            <span>Maximum support</span>
                        </div>
                        <p class="setting-hint">Level <span id="scaffolding-value">${currentSettings.scaffoldingLevel || 3}</span>: ${getScaffoldingDescription(currentSettings.scaffoldingLevel || 3)}</p>
                    </div>
                </div>

                <!-- Vocabulary Preferences -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-spell-check"></i> Vocabulary & Terminology</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Order of Operations</label>
                            <select id="order-of-operations">
                                <option value="GEMS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'GEMS' ? 'selected' : ''}>GEMS (Grouping, Exponents, Multiply/Divide, Subtract/Add)</option>
                                <option value="PEMDAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'PEMDAS' ? 'selected' : ''}>PEMDAS (Parentheses, Exponents...)</option>
                                <option value="BODMAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'BODMAS' ? 'selected' : ''}>BODMAS (Brackets, Orders...)</option>
                                <option value="BEDMAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'BEDMAS' ? 'selected' : ''}>BEDMAS (Brackets, Exponents...)</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Custom Vocabulary Rules</label>
                        <div class="vocab-chips" id="vocab-chips">
                            ${(currentSettings.vocabularyPreferences?.customVocabulary || []).map(v =>
                                `<span class="vocab-chip">${v}<span class="remove-chip" onclick="removeVocabChip(this)">&times;</span></span>`
                            ).join('')}
                        </div>
                        <div class="add-vocab-row">
                            <input type="text" id="new-vocab" placeholder="e.g., Use 'rate of change' instead of 'slope'">
                            <button type="button" onclick="addVocabChip()"><i class="fas fa-plus"></i></button>
                        </div>
                        <p class="setting-hint">Add custom terminology preferences the AI should follow</p>
                    </div>
                </div>

                <!-- Solution Approaches -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-route"></i> Solution Approaches</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Solving Equations</label>
                            <select id="equation-solving">
                                <option value="any" ${currentSettings.solutionApproaches?.equationSolving === 'any' ? 'selected' : ''}>Any Method</option>
                                <option value="opposite-operations" ${currentSettings.solutionApproaches?.equationSolving === 'opposite-operations' ? 'selected' : ''}>Opposite Operations</option>
                                <option value="balance-method" ${currentSettings.solutionApproaches?.equationSolving === 'balance-method' ? 'selected' : ''}>Balance Method</option>
                                <option value="algebraic-manipulation" ${currentSettings.solutionApproaches?.equationSolving === 'algebraic-manipulation' ? 'selected' : ''}>Algebraic Manipulation</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Fraction Operations</label>
                            <select id="fraction-operations">
                                <option value="any" ${currentSettings.solutionApproaches?.fractionOperations === 'any' ? 'selected' : ''}>Any Method</option>
                                <option value="butterfly-method" ${currentSettings.solutionApproaches?.fractionOperations === 'butterfly-method' ? 'selected' : ''}>Butterfly Method</option>
                                <option value="traditional-lcd" ${currentSettings.solutionApproaches?.fractionOperations === 'traditional-lcd' ? 'selected' : ''}>Traditional LCD</option>
                                <option value="visual-models" ${currentSettings.solutionApproaches?.fractionOperations === 'visual-models' ? 'selected' : ''}>Visual Models</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Word Problems</label>
                            <select id="word-problems">
                                <option value="any" ${currentSettings.solutionApproaches?.wordProblems === 'any' ? 'selected' : ''}>Any Strategy</option>
                                <option value="CUBES" ${currentSettings.solutionApproaches?.wordProblems === 'CUBES' ? 'selected' : ''}>CUBES Strategy</option>
                                <option value="UPS-Check" ${currentSettings.solutionApproaches?.wordProblems === 'UPS-Check' ? 'selected' : ''}>UPS-Check</option>
                                <option value="draw-first" ${currentSettings.solutionApproaches?.wordProblems === 'draw-first' ? 'selected' : ''}>Draw First</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Other Approach Notes</label>
                        <textarea id="custom-approaches" placeholder="e.g., For systems of equations, always try graphing first before substitution...">${currentSettings.solutionApproaches?.customApproaches || ''}</textarea>
                    </div>
                </div>

                <!-- Manipulatives -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-cubes"></i> Manipulatives & Visual Aids</h3>
                    <div class="setting-row">
                        <div class="setting-group" style="flex: 0 0 auto;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="manipulatives-allowed" ${currentSettings.manipulatives?.allowed !== false ? 'checked' : ''}>
                                Allow virtual manipulatives
                            </label>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Preferred Manipulatives</label>
                        <div class="checkbox-grid">
                            <label><input type="checkbox" name="manipulative" value="number-line" ${(currentSettings.manipulatives?.preferred || []).includes('number-line') ? 'checked' : ''}> Number Line</label>
                            <label><input type="checkbox" name="manipulative" value="algebra-tiles" ${(currentSettings.manipulatives?.preferred || []).includes('algebra-tiles') ? 'checked' : ''}> Algebra Tiles</label>
                            <label><input type="checkbox" name="manipulative" value="fraction-bars" ${(currentSettings.manipulatives?.preferred || []).includes('fraction-bars') ? 'checked' : ''}> Fraction Bars</label>
                            <label><input type="checkbox" name="manipulative" value="area-model" ${(currentSettings.manipulatives?.preferred || []).includes('area-model') ? 'checked' : ''}> Area Model</label>
                            <label><input type="checkbox" name="manipulative" value="base-ten-blocks" ${(currentSettings.manipulatives?.preferred || []).includes('base-ten-blocks') ? 'checked' : ''}> Base-Ten Blocks</label>
                            <label><input type="checkbox" name="manipulative" value="coordinate-plane" ${(currentSettings.manipulatives?.preferred || []).includes('coordinate-plane') ? 'checked' : ''}> Coordinate Plane</label>
                        </div>
                    </div>
                </div>

                <!-- Current Teaching Context -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-chalkboard-teacher"></i> Current Teaching Context</h3>
                    <p style="color: #666; font-size: 0.9em; margin-bottom: 16px;">Tell the AI what you're currently teaching so it can align with your classroom instruction.</p>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Current Topic</label>
                            <input type="text" id="current-topic" placeholder="e.g., Solving two-step equations" value="${currentSettings.currentTeaching?.topic || ''}">
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>How I Teach It</label>
                        <textarea id="teaching-approach" placeholder="e.g., I teach balancing equations by showing both sides of a scale. We always draw the scale first before writing algebraic steps...">${currentSettings.currentTeaching?.approach || ''}</textarea>
                    </div>
                    <div class="setting-group">
                        <label>Pacing Notes</label>
                        <textarea id="pacing-notes" placeholder="e.g., We're taking it slow - prioritize understanding over speed. Most students struggle with negative numbers...">${currentSettings.currentTeaching?.pacing || ''}</textarea>
                    </div>
                </div>

                <!-- Response Style -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-comment-dots"></i> Response Style</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Encouragement Level</label>
                            <select id="encouragement-level">
                                <option value="minimal" ${currentSettings.responseStyle?.encouragementLevel === 'minimal' ? 'selected' : ''}>Minimal</option>
                                <option value="moderate" ${currentSettings.responseStyle?.encouragementLevel === 'moderate' || !currentSettings.responseStyle?.encouragementLevel ? 'selected' : ''}>Moderate</option>
                                <option value="high" ${currentSettings.responseStyle?.encouragementLevel === 'high' ? 'selected' : ''}>High</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Error Correction Style</label>
                            <select id="error-correction">
                                <option value="direct" ${currentSettings.responseStyle?.errorCorrectionStyle === 'direct' ? 'selected' : ''}>Direct (Point out errors clearly)</option>
                                <option value="socratic" ${currentSettings.responseStyle?.errorCorrectionStyle === 'socratic' || !currentSettings.responseStyle?.errorCorrectionStyle ? 'selected' : ''}>Socratic (Guide with questions)</option>
                                <option value="discovery" ${currentSettings.responseStyle?.errorCorrectionStyle === 'discovery' ? 'selected' : ''}>Discovery (Let students find errors)</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Show Work Requirement</label>
                            <select id="show-work">
                                <option value="always" ${currentSettings.responseStyle?.showWorkRequirement === 'always' || !currentSettings.responseStyle?.showWorkRequirement ? 'selected' : ''}>Always Required</option>
                                <option value="sometimes" ${currentSettings.responseStyle?.showWorkRequirement === 'sometimes' ? 'selected' : ''}>Sometimes</option>
                                <option value="never" ${currentSettings.responseStyle?.showWorkRequirement === 'never' ? 'selected' : ''}>Never Required</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-ai-settings">Cancel</button>
                    <button class="btn btn-primary" id="save-ai-settings"><i class="fas fa-save"></i> Save Settings</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('close-ai-settings').onclick = () => modal.remove();
        document.getElementById('cancel-ai-settings').onclick = () => modal.remove();
        document.getElementById('save-ai-settings').onclick = () => saveAISettings(modal);

        // Scaffolding slider update
        const slider = document.getElementById('scaffolding-level');
        slider.oninput = () => {
            document.getElementById('scaffolding-value').textContent = slider.value;
            document.querySelector('.setting-hint').textContent = `Level ${slider.value}: ${getScaffoldingDescription(parseInt(slider.value))}`;
        };

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    function getScaffoldingDescription(level) {
        const descriptions = {
            1: 'Student must work mostly independently. Only hints when really stuck.',
            2: 'Occasional guidance. Let students struggle productively before helping.',
            3: 'Balanced support. Provide hints after reasonable effort.',
            4: 'Supportive approach. Guide students through each step.',
            5: 'Maximum scaffolding. Break everything into small steps with lots of encouragement.'
        };
        return descriptions[level] || descriptions[3];
    }

    // Global functions for vocab chips
    window.addVocabChip = function() {
        const input = document.getElementById('new-vocab');
        const value = input.value.trim();
        if (value) {
            const chipsContainer = document.getElementById('vocab-chips');
            const chip = document.createElement('span');
            chip.className = 'vocab-chip';
            chip.innerHTML = `${value}<span class="remove-chip" onclick="removeVocabChip(this)">&times;</span>`;
            chipsContainer.appendChild(chip);
            input.value = '';
        }
    };

    window.removeVocabChip = function(btn) {
        btn.parentElement.remove();
    };

    async function saveAISettings(modal) {
        const saveBtn = document.getElementById('save-ai-settings');
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        // Gather all settings
        const settings = {
            calculatorAccess: document.getElementById('calculator-access').value,
            calculatorNote: document.getElementById('calculator-note').value,
            scaffoldingLevel: parseInt(document.getElementById('scaffolding-level').value),
            vocabularyPreferences: {
                orderOfOperations: document.getElementById('order-of-operations').value,
                customVocabulary: Array.from(document.querySelectorAll('.vocab-chip')).map(chip =>
                    chip.textContent.replace('×', '').trim()
                )
            },
            solutionApproaches: {
                equationSolving: document.getElementById('equation-solving').value,
                fractionOperations: document.getElementById('fraction-operations').value,
                wordProblems: document.getElementById('word-problems').value,
                customApproaches: document.getElementById('custom-approaches').value
            },
            manipulatives: {
                allowed: document.getElementById('manipulatives-allowed').checked,
                preferred: Array.from(document.querySelectorAll('input[name="manipulative"]:checked')).map(cb => cb.value)
            },
            currentTeaching: {
                topic: document.getElementById('current-topic').value,
                approach: document.getElementById('teaching-approach').value,
                pacing: document.getElementById('pacing-notes').value
            },
            responseStyle: {
                encouragementLevel: document.getElementById('encouragement-level').value,
                errorCorrectionStyle: document.getElementById('error-correction').value,
                showWorkRequirement: document.getElementById('show-work').value
            }
        };

        try {
            const response = await csrfFetch('/api/teacher/class-ai-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            const result = await response.json();

            if (result.success) {
                if (typeof showToast === 'function') {
                    showToast('AI Settings saved successfully!', 'success');
                } else {
                    alert('Settings saved successfully!');
                }
                modal.remove();
            } else {
                throw new Error(result.message || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving AI settings:', error);
            if (typeof showToast === 'function') {
                showToast('Failed to save settings: ' + error.message, 'error');
            } else {
                alert('Failed to save settings: ' + error.message);
            }
        } finally {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
            saveBtn.disabled = false;
        }
    }
});
