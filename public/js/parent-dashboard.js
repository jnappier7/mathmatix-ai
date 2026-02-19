// public/js/parent-dashboard.js
// 3x Better: Toast system, parallel loading, skill mastery ring, weekly summary,
// growth sparkline, copy-to-clipboard, skeleton loading, accessibility improvements.

document.addEventListener("DOMContentLoaded", async () => {

    // ============================================
    // TOAST NOTIFICATION SYSTEM
    // ============================================

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info} toast-icon"></i>
            <span>${message}</span>
            <button class="toast-close" aria-label="Dismiss notification">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('toast-exit');
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        }
    }

    // ============================================
    // COPY TO CLIPBOARD
    // ============================================

    function setupCopyButtons() {
        const copyBtn = document.getElementById('copy-code-btn');
        const mobileCopyBtn = document.getElementById('mobile-copy-code-btn');

        function handleCopy(btn) {
            if (!btn) return;
            btn.addEventListener('click', async () => {
                const codeEl = document.getElementById('generated-code-value');
                const code = codeEl ? codeEl.textContent.trim() : '';
                if (!code) return;

                try {
                    await navigator.clipboard.writeText(code);
                    btn.classList.add('copied');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    showToast('Invite code copied to clipboard!', 'success', 2000);
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = originalHTML;
                    }, 2000);
                } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = code;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    btn.classList.add('copied');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    showToast('Invite code copied!', 'success', 2000);
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = originalHTML;
                    }, 2000);
                }
            });
        }

        handleCopy(copyBtn);
        handleCopy(mobileCopyBtn);
    }

    // ============================================
    // SKELETON LOADING
    // ============================================

    function showChildrenSkeleton() {
        if (!childrenListContainer) return;
        childrenListContainer.innerHTML = `
            <div class="skeleton skeleton-card" style="height: 200px; margin-bottom: 15px;"></div>
            <div class="skeleton skeleton-card" style="height: 200px; margin-bottom: 15px;"></div>
        `;
    }

    function hideChildrenSkeleton() {
        const skeletons = childrenListContainer?.querySelectorAll('.skeleton');
        if (skeletons) skeletons.forEach(s => s.remove());
    }

    // ============================================
    // SVG SKILL MASTERY RING
    // ============================================

    function buildSkillMasteryRing(skillsSummary) {
        const mastered = skillsSummary?.mastered || 0;
        const learning = skillsSummary?.learning || 0;
        const needsReview = skillsSummary?.needsReview || 0;
        const total = mastered + learning + needsReview;

        if (total === 0) return '';

        const radius = 32;
        const circumference = 2 * Math.PI * radius;

        // Calculate stroke segments
        const masteredPct = mastered / total;
        const learningPct = learning / total;
        const reviewPct = needsReview / total;

        const masteredLen = masteredPct * circumference;
        const learningLen = learningPct * circumference;
        const reviewLen = reviewPct * circumference;

        const masteredOffset = 0;
        const learningOffset = masteredLen;
        const reviewOffset = masteredLen + learningLen;

        return `
            <div class="skill-mastery-container">
                <div class="skill-ring-wrapper">
                    <svg viewBox="0 0 80 80" width="80" height="80">
                        <!-- Background circle -->
                        <circle cx="40" cy="40" r="${radius}" fill="none" stroke="#e9ecef" stroke-width="8"/>
                        ${mastered > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#27ae60" stroke-width="8"
                            stroke-dasharray="${masteredLen} ${circumference - masteredLen}"
                            stroke-dashoffset="${-masteredOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                        ${learning > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#3498db" stroke-width="8"
                            stroke-dasharray="${learningLen} ${circumference - learningLen}"
                            stroke-dashoffset="${-learningOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                        ${needsReview > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#f39c12" stroke-width="8"
                            stroke-dasharray="${reviewLen} ${circumference - reviewLen}"
                            stroke-dashoffset="${-reviewOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                    </svg>
                    <div class="skill-ring-center">
                        <div class="skill-ring-number">${total}</div>
                        <div class="skill-ring-label">skills</div>
                    </div>
                </div>
                <div class="skill-legend">
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #27ae60;"></span>
                        <span>${mastered} mastered</span>
                    </div>
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #3498db;"></span>
                        <span>${learning} learning</span>
                    </div>
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #f39c12;"></span>
                        <span>${needsReview} needs review</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // WEEKLY SUMMARY CARD
    // ============================================

    function buildWeeklySummary(weeklyStats) {
        if (!weeklyStats) return '';
        const accuracy = weeklyStats.accuracy || 0;
        const problems = weeklyStats.problemsAttempted || 0;
        const minutes = weeklyStats.activeMinutes || 0;
        const sessions = weeklyStats.sessionCount || 0;

        // Don't show if no activity
        if (problems === 0 && minutes === 0 && sessions === 0) {
            return `
                <div class="weekly-summary" style="justify-content: center;">
                    <div style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); font-size: 0.85em; padding: 8px;">
                        <i class="fas fa-calendar-week"></i> No activity this week yet
                    </div>
                </div>
            `;
        }

        return `
            <div class="weekly-summary" role="region" aria-label="This week's summary">
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${sessions}</div>
                    <div class="weekly-stat-label">Sessions</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${problems}</div>
                    <div class="weekly-stat-label">Problems</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${accuracy}%</div>
                    <div class="weekly-stat-label">Accuracy</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${Math.round(minutes)}</div>
                    <div class="weekly-stat-label">Minutes</div>
                </div>
            </div>
        `;
    }

    // ============================================
    // GROWTH TREND SPARKLINE
    // ============================================

    function buildGrowthSparkline(growthData) {
        if (!growthData || !growthData.history || growthData.history.length < 2) return '';

        const history = growthData.history;
        const totalGrowth = growthData.totalGrowth || 0;
        const isPositive = totalGrowth >= 0;

        // Build SVG sparkline
        const width = 260;
        const height = 40;
        const padding = 4;

        // Extract theta values (cumulative)
        let runningTheta = 0;
        const points = history.map((h, i) => {
            runningTheta += (h.thetaChange || 0);
            return runningTheta;
        });

        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        const range = maxVal - minVal || 1;

        const coords = points.map((val, i) => {
            const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((val - minVal) / range) * (height - 2 * padding);
            return `${x},${y}`;
        });

        const polyline = coords.join(' ');
        const strokeColor = isPositive ? '#27ae60' : '#e74c3c';
        const fillColor = isPositive ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)';

        // Create fill polygon (area under curve)
        const firstX = padding;
        const lastX = padding + (width - 2 * padding);
        const fillPoints = `${firstX},${height} ${polyline} ${lastX},${height}`;

        const badgeColor = isPositive ? 'background: #d5f5e3; color: #1e8449;' : 'background: #fadbd8; color: #c0392b;';
        const badgeText = isPositive
            ? `<i class="fas fa-arrow-up"></i> +${Math.abs(totalGrowth).toFixed(2)}`
            : `<i class="fas fa-arrow-down"></i> ${totalGrowth.toFixed(2)}`;

        return `
            <div class="growth-sparkline-container">
                <div class="growth-sparkline-header">
                    <span class="growth-sparkline-title"><i class="fas fa-chart-line"></i> Growth Trend</span>
                    <span class="growth-sparkline-badge" style="${badgeColor}">${badgeText}</span>
                </div>
                <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" aria-label="Growth trend chart showing ${history.length} data points">
                    <polygon points="${fillPoints}" fill="${fillColor}"/>
                    <polyline points="${polyline}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                    <!-- Latest point dot -->
                    <circle cx="${coords[coords.length - 1].split(',')[0]}" cy="${coords[coords.length - 1].split(',')[1]}" r="3" fill="${strokeColor}"/>
                </svg>
                <div style="font-size: 0.72em; color: var(--color-text-muted); margin-top: 4px;">
                    ${history.length} growth check${history.length !== 1 ? 's' : ''} completed
                </div>
            </div>
        `;
    }

    // --- Dashboard Elements ---
    const childrenListContainer = document.getElementById("children-list-container");
    const loadingChildren = document.getElementById("loading-children");
    const generateCodeBtn = document.getElementById("generate-code-btn");
    const inviteCodeOutput = document.getElementById("invite-code-output");
    const generatedCodeValue = document.getElementById("generated-code-value");
    const codeExpiresAt = document.getElementById("code-expires-at");
    const linkStudentForm = document.getElementById("link-student-form");
    const studentLinkCodeInput = document.getElementById("studentLinkCode");
    const linkStudentMessage = document.getElementById("link-student-message");

    // --- Parent Settings Elements ---
    const parentSettingsForm = document.getElementById("parent-settings-form");
    const settingsSaveMessage = document.getElementById("settings-save-message");

    // --- Parent Chat Widget Elements ---
    const childSelector = document.getElementById("childSelector");
    const parentChatContainer = document.getElementById("parent-chat-container-inner");
    const parentUserInput = document.getElementById("parent-user-input");
    const parentSendButton = document.getElementById("parent-send-button");
    const parentThinkingIndicator = document.getElementById("parent-thinking-indicator");

    let children = []; // Stores linked children data
    let selectedChild = null; // Stores the currently selected child for chat
    let currentParentId = null; // Store the parent's ID

    const PARENT_CHAT_MAX_MESSAGE_LENGTH = 1800;

    // Tutor configuration (simplified for parent dashboard)
    const TUTOR_CONFIG = {
        "bob": { name: "Bob", image: "bob.png" },
        "maya": { name: "Maya", image: "maya.png" },
        "ms-maria": { name: "Ms. Maria", image: "ms-maria.png" },
        "mr-nappier": { name: "Mr. Nappier", image: "mr-nappier.png" },
        "ms-rashida": { name: "Ms. Rashida", image: "ms-rashida.png" },
        "prof-davies": { name: "Prof. Davies", image: "prof-davies.png" },
        "ms-alex": { name: "Ms. Alex", image: "ms-alex.png" },
        "mr-lee": { name: "Mr. Lee", image: "mr-lee.png" },
        "dr-g": { name: "Dr. G", image: "dr-g.png" },
        "default": { name: "Math Tutor", image: "default-tutor.png" }
    };

    // --- Authenticate and Load Parent User Data ---
    async function loadParentUser() {
        try {
            const res = await fetch("/user", { credentials: 'include' });
            if (!res.ok) {
                showToast("Session expired. Please log in again.", "warning");
                setTimeout(() => { window.location.href = "/login.html"; }, 1500);
                return null;
            }
            const data = await res.json();
            currentParentId = data.user._id;
            return data.user;
        } catch (error) {
            console.error("ERROR: Failed to load parent user data:", error);
            showToast("Could not load session. Redirecting to login...", "error");
            setTimeout(() => { window.location.href = "/login.html"; }, 1500);
            return null;
        }
    }

    // Current tutor info for chat bubbles
    let currentTutorInfo = { name: 'Math Tutor', image: 'default-tutor.png' };

    // --- Helper for appending messages to parent chat widget ---
    function appendParentMessage(sender, text, tutorInfo = null) {
        // Update tutor info if provided
        if (tutorInfo && tutorInfo.tutorName) {
            currentTutorInfo = { name: tutorInfo.tutorName, image: tutorInfo.tutorImage || 'default-tutor.png' };
        }

        const container = document.createElement("div");
        container.className = `message-container ${sender}`;
        container.style.cssText = 'display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; width: 100%;';

        if (sender === 'user') {
            container.style.justifyContent = 'flex-end';
            container.style.flexDirection = 'row-reverse';
            container.setAttribute('aria-label', 'Your message');
        } else {
            container.style.justifyContent = 'flex-start';
            container.setAttribute('aria-label', `Message from ${currentTutorInfo.name}`);
        }

        // Create avatar for AI messages
        if (sender === 'ai') {
            const avatar = document.createElement("div");
            avatar.className = 'message-avatar';
            avatar.style.cssText = 'flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 2px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); background: #fff;';

            const avatarImg = document.createElement("img");
            avatarImg.src = `/images/tutor_avatars/${currentTutorInfo.image}`;
            avatarImg.alt = currentTutorInfo.name;
            avatarImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: center top;';
            avatarImg.onerror = () => { avatarImg.src = '/images/tutor_avatars/default-tutor.png'; };

            avatar.appendChild(avatarImg);
            container.appendChild(avatar);
        }

        const msg = document.createElement("div");
        msg.className = `message ${sender} message-widget`;

        // Match main chat bubble styling
        if (sender === 'user') {
            msg.style.cssText = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 16px; border-radius: 18px 18px 4px 18px; max-width: 80%; box-shadow: 0 2px 8px rgba(102,126,234,0.3); line-height: 1.5; font-size: 0.95em;';
        } else if (sender === 'ai') {
            msg.style.cssText = 'background-color: #f5f5f5; color: #333; padding: 12px 16px; border-radius: 18px 18px 18px 4px; max-width: 80%; border: 1px solid #e0e0e0; line-height: 1.5; font-size: 0.95em; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        }

        msg.innerText = text;
        container.appendChild(msg);

        parentChatContainer.style.display = 'flex';
        parentChatContainer.style.flexDirection = 'column';
        parentChatContainer.appendChild(container);
        parentChatContainer.scrollTop = parentChatContainer.scrollHeight;
    }

    // --- Update Tutor Avatar Display ---
    function updateTutorAvatar(child) {
        const tutorAvatarContainer = document.getElementById('tutor-avatar-container');
        const tutorAvatarImg = document.getElementById('tutor-avatar-img');
        const tutorNameDisplay = document.getElementById('tutor-name');

        if (!child || !child.selectedTutorId) {
            // Reset to default tutor
            currentTutorInfo = { name: 'Math Tutor', image: 'default-tutor.png' };
            if (tutorAvatarContainer) tutorAvatarContainer.style.display = 'none';
            return;
        }

        const tutorId = child.selectedTutorId;
        const tutor = TUTOR_CONFIG[tutorId] || TUTOR_CONFIG['default'];

        // Update current tutor info for chat bubbles
        currentTutorInfo = { name: tutor.name, image: tutor.image };

        if (tutorAvatarImg) {
            tutorAvatarImg.src = `/images/tutor_avatars/${tutor.image}`;
            tutorAvatarImg.alt = tutor.name;
        }
        if (tutorNameDisplay) tutorNameDisplay.textContent = tutor.name;
        if (tutorAvatarContainer) tutorAvatarContainer.style.display = 'block';
    }

    // --- Load children with PARALLEL progress fetching ---
    async function loadChildren() {
        if (loadingChildren) loadingChildren.style.display = 'block';
        showChildrenSkeleton();
        if (childSelector) childSelector.innerHTML = '<option value="">Select Child</option>';

        try {
            // Step 1: Fetch the list of linked children
            const childrenRes = await fetch("/api/parent/children", { credentials: 'include' });
            if (!childrenRes.ok) {
                if (childrenRes.status === 401 || childrenRes.status === 403) {
                    window.location.href = "/login.html";
                }
                throw new Error(`HTTP error! status: ${childrenRes.status}`);
            }
            const fetchedChildren = await childrenRes.json();
            children = fetchedChildren;

            if (loadingChildren) loadingChildren.style.display = 'none';

            if (children.length === 0) {
                childrenListContainer.innerHTML = `<p class="text-center text-gray-500 py-4">No children linked yet. Use the tools on the left to link a child's account.</p>`;
                if (childSelector) childSelector.disabled = true;
                if (parentUserInput) parentUserInput.disabled = true;
                if (parentSendButton) parentSendButton.disabled = true;
                return;
            }

            // Step 2: Populate dropdown
            children.forEach((child, i) => {
                const option = document.createElement('option');
                option.value = child._id;
                option.textContent = `${child.firstName} ${child.lastName}`;
                childSelector.appendChild(option);
                if (i === 0) {
                    selectedChild = child;
                    childSelector.value = child._id;
                    updateTutorAvatar(selectedChild);
                }
            });

            if (childSelector) childSelector.disabled = false;
            if (parentUserInput) parentUserInput.disabled = false;
            if (parentSendButton) parentSendButton.disabled = false;
            if (parentChatContainer) parentChatContainer.innerHTML = '<p class="text-gray-500 text-center py-2">Select a child and ask a question about their progress.</p>';

            // Step 3: PARALLEL fetch — progress + growth for all children at once
            childrenListContainer.innerHTML = '';

            const progressPromises = children.map(async (child) => {
                try {
                    // Fetch progress and growth data in parallel per child
                    const [progressRes, growthRes] = await Promise.all([
                        fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' }),
                        fetch(`/api/parent/child/${child._id}/growth-history`, { credentials: 'include' })
                    ]);

                    const progress = progressRes.ok ? await progressRes.json() : null;
                    const growthData = growthRes.ok ? await growthRes.json() : null;

                    return { child, progress, growthData, error: progress ? null : 'Failed to load' };
                } catch (err) {
                    console.error(`Could not fetch data for child ${child._id}:`, err);
                    return { child, progress: null, growthData: null, error: err.message };
                }
            });

            const results = await Promise.all(progressPromises);

            // Render all cards in order
            results.forEach(({ child, progress, growthData, error }) => {
                if (progress) {
                    renderChildCard(progress, growthData);
                } else {
                    const errorCard = document.createElement('div');
                    errorCard.className = 'child-card';
                    errorCard.innerHTML = `
                        <h3>${child.firstName} ${child.lastName}</h3>
                        <p style="color: var(--color-danger); font-size: 0.9em;">
                            <i class="fas fa-exclamation-triangle"></i> Could not load progress data.
                            <button class="btn btn-tertiary" style="margin-top: 8px; font-size: 0.85em;" onclick="location.reload()">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </p>
                    `;
                    childrenListContainer.appendChild(errorCard);
                }
            });

        } catch (error) {
            console.error("Parent dashboard error fetching children list:", error);
            if (loadingChildren) loadingChildren.style.display = 'none';
            childrenListContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--color-danger);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2em; margin-bottom: 10px; display: block;"></i>
                    <p>Failed to load children data.</p>
                    <button class="btn btn-primary" style="margin-top: 12px;" onclick="location.reload()">
                        <i class="fas fa-redo"></i> Refresh Page
                    </button>
                </div>
            `;
        }
    }

    function renderChildCard(progress, growthData) {
        const card = document.createElement('div');
        card.className = 'child-card';
        card.dataset.childId = progress._id;

        // Build IEP accommodations display
        let accommodationsHTML = '';
        if (progress.iepPlan && progress.iepPlan.accommodations) {
            const accom = progress.iepPlan.accommodations;
            const activeAccommodations = [];

            if (accom.extendedTime) activeAccommodations.push('Extended Time');
            if (accom.reducedDistraction) activeAccommodations.push('Reduced Distraction');
            if (accom.calculatorAllowed) activeAccommodations.push('Calculator Allowed');
            if (accom.audioReadAloud) activeAccommodations.push('Audio Read-Aloud');
            if (accom.chunkedAssignments) activeAccommodations.push('Chunked Assignments');
            if (accom.breaksAsNeeded) activeAccommodations.push('Breaks as Needed');
            if (accom.digitalMultiplicationChart) activeAccommodations.push('Digital Multiplication Chart');
            if (accom.largePrintHighContrast) activeAccommodations.push('Large Print/High Contrast');
            if (accom.mathAnxietySupport) activeAccommodations.push('Math Anxiety Support');
            if (accom.custom && accom.custom.length > 0) {
                activeAccommodations.push(...accom.custom);
            }

            if (activeAccommodations.length > 0) {
                accommodationsHTML = `
                    <div class="iep-accommodations" style="margin-top: 12px;">
                        <strong><i class="fas fa-universal-access"></i> Active Accommodations:</strong>
                        <ul style="margin: 8px 0; padding-left: 20px; font-size: 0.9em;">
                            ${activeAccommodations.map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        }

        // Build IEP goals display with progress timeline
        let goalsHTML = '';
        if (progress.iepPlan && progress.iepPlan.goals && progress.iepPlan.goals.length > 0) {
            goalsHTML = `
                <div class="iep-goals" style="margin-top: 12px;">
                    <strong><i class="fas fa-bullseye"></i> IEP Goals:</strong>
                    <div style="margin-top: 8px;">
                        ${progress.iepPlan.goals.map(goal => {
                            const statusColor = goal.status === 'completed' ? 'var(--color-success)' :
                                              goal.status === 'on-hold' ? 'var(--color-warning-dark)' : 'var(--color-primary)';
                            const progressPercent = goal.currentProgress || 0;

                            // Calculate trend from history
                            const progressHistory = (goal.history || []).filter(h => h.field === 'currentProgress');
                            const recentUpdates = progressHistory.filter(h => {
                                const d = new Date(h.date);
                                const twoWeeksAgo = new Date();
                                twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
                                return d >= twoWeeksAgo;
                            });
                            const recentGain = recentUpdates.reduce((sum, h) => sum + ((h.to || 0) - (h.from || 0)), 0);

                            let trendIcon = '';
                            let trendText = '';
                            if (recentUpdates.length > 0) {
                                if (recentGain > 0) {
                                    trendIcon = '<i class="fas fa-arrow-up" style="color: var(--color-success);"></i>';
                                    trendText = `+${recentGain}% in the last 2 weeks (${recentUpdates.length} update${recentUpdates.length !== 1 ? 's' : ''})`;
                                } else {
                                    trendIcon = '<i class="fas fa-minus" style="color: var(--color-warning-dark);"></i>';
                                    trendText = `No change in the last 2 weeks`;
                                }
                            } else if (progressHistory.length > 0) {
                                trendText = `${progressHistory.length} total AI-tracked update${progressHistory.length !== 1 ? 's' : ''}`;
                            } else {
                                trendText = 'AI tracking will begin as your child works on this skill';
                            }

                            // Days remaining
                            let deadlineNote = '';
                            if (goal.targetDate && goal.status === 'active') {
                                const daysLeft = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000*60*60*24));
                                if (daysLeft < 0) deadlineNote = `<span style="color: var(--color-danger); font-weight:600;">${Math.abs(daysLeft)} days past target</span>`;
                                else if (daysLeft <= 14) deadlineNote = `<span style="color: var(--color-warning-dark);">${daysLeft} days remaining</span>`;
                            }

                            const statusIcon = goal.status === 'completed' ? 'fa-check-circle' :
                                             goal.status === 'on-hold' ? 'fa-pause-circle' : 'fa-spinner';

                            return `
                                <div style="margin-bottom: 12px; padding: 12px; background: var(--color-bg); border-left: 4px solid ${statusColor}; border-radius: var(--radius-sm);">
                                    <div style="font-weight: 600; margin-bottom: 4px;">${goal.description}</div>
                                    <div style="font-size: 0.85em; color: var(--color-text-secondary); display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                        <span><i class="fas ${statusIcon}" style="color:${statusColor};"></i> <strong style="color:${statusColor}; text-transform:capitalize;">${goal.status}</strong></span>
                                        <span>Progress: <strong>${progressPercent}%</strong></span>
                                        ${goal.targetDate ? `<span>Target: <strong>${new Date(goal.targetDate).toLocaleDateString()}</strong></span>` : ''}
                                        ${deadlineNote}
                                    </div>
                                    <div style="width: 100%; height: 8px; background: var(--color-border); border-radius: 4px; margin-top: 8px; overflow: hidden;">
                                        <div style="width: ${progressPercent}%; height: 100%; background: ${statusColor}; transition: width 0.5s; border-radius: 4px;"></div>
                                    </div>
                                    <div style="font-size: 0.8em; color: var(--color-text-muted); margin-top: 6px; display:flex; align-items:center; gap:4px;">
                                        ${trendIcon} ${trendText}
                                    </div>
                                    ${goal.measurementMethod ? `<div style="font-size: 0.75em; color: var(--color-text-disabled); margin-top: 3px;">Measured by: ${goal.measurementMethod}</div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Build weekly summary
        const weeklySummaryHTML = buildWeeklySummary(progress.weeklyStats);

        // Build skill mastery ring
        const skillRingHTML = buildSkillMasteryRing(progress.skillsSummary);

        // Build growth sparkline
        const growthSparklineHTML = growthData ? buildGrowthSparkline(growthData) : '';

        // Build sessions
        const sessionsHTML = progress.recentSessions && progress.recentSessions.length > 0 ? progress.recentSessions
            .filter(s => {
                if (!s.date) return false;
                if (!s.summary) return false;
                if (s.summary.includes('--- End Session Transcript ---') ||
                    s.summary.includes('Please provide a summary') ||
                    s.summary.includes('**Concise (1-3 paragraphs)**')) {
                    return false;
                }
                return true;
            })
            .map(s => {
                const sessionDate = new Date(s.date);
                const dateStr = isNaN(sessionDate.getTime()) ? 'Unknown date' : sessionDate.toLocaleDateString();
                const isLive = s.isActive;
                const liveBadge = isLive ? '<span class="live-badge"><span class="live-badge-dot"></span> LIVE</span>' : '';
                const entryClass = isLive ? 'session-entry live-session' : 'session-entry';
                return `
                    <div class="${entryClass}">
                        ${liveBadge}<strong>${dateStr}:</strong> ${s.summary} <em>(${s.duration ? s.duration.toFixed(0) : 'N/A'} min)</em>
                    </div>
                `;
            }).join('') || '<p style="color: var(--color-text-muted); font-size: 0.85em;">No recent sessions with summaries.</p>'
        : '<p style="color: var(--color-text-muted); font-size: 0.85em;">No recent sessions with summaries.</p>';

        card.innerHTML = `
            <div class="child-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <h3>${progress.firstName || 'Unknown'} ${progress.lastName || 'Child'}</h3>
                    <span style="font-size: 0.85em; color: var(--color-text-secondary);">Level ${progress.level || '1'} — ${progress.xp || '0'} XP</span>
                </div>
                <button class="view-as-child-btn btn" data-childid="${progress._id}" data-childname="${progress.firstName || 'Child'}" title="See what ${progress.firstName || 'your child'} sees" aria-label="View dashboard as ${progress.firstName || 'child'}" style="background: var(--color-purple); color: white; font-size: 0.85em; padding: 8px 14px;">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
            <div style="font-size: 0.85em; color: var(--color-text-muted); margin-bottom: 8px;">
                ${progress.gradeLevel || 'N/A'} · ${progress.mathCourse || 'N/A'} · ${progress.totalActiveTutoringMinutes || '0'} min total
            </div>

            ${weeklySummaryHTML}
            ${skillRingHTML}
            ${growthSparklineHTML}
            ${accommodationsHTML}
            ${goalsHTML}

            <div style="margin-top: 12px;">
                <strong style="font-size: 0.9em;"><i class="fas fa-history"></i> Recent Sessions:</strong>
                <div style="margin-top: 8px;">
                    ${sessionsHTML}
                </div>
            </div>
        `;
        childrenListContainer.appendChild(card);

        // Add event listener for View as Child button
        const viewAsChildBtn = card.querySelector('.view-as-child-btn');
        if (viewAsChildBtn) {
            viewAsChildBtn.addEventListener('click', async (e) => {
                const childId = e.currentTarget.dataset.childid;
                const childName = e.currentTarget.dataset.childname;

                if (!confirm(`View the app as ${childName}?\n\nYou'll see exactly what your child sees.\nChanges are disabled in view mode.`)) {
                    return;
                }

                try {
                    viewAsChildBtn.disabled = true;
                    viewAsChildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

                    await window.ImpersonationBanner.start(childId, { readOnly: true });
                } catch (error) {
                    console.error('Failed to start child view:', error);
                    showToast(error.message || 'Failed to start child view. Please try again.', 'error');
                    viewAsChildBtn.disabled = false;
                    viewAsChildBtn.innerHTML = '<i class="fas fa-eye"></i> View';
                }
            });
        }
    }

    // --- Load Parent Settings ---
    async function loadParentSettings() {
        try {
            const res = await fetch("/api/parent/settings", { credentials: 'include' });
            if (!res.ok) {
                throw new Error("Failed to load settings");
            }
            const settings = await res.json();

            // Populate form fields
            if (document.getElementById('reportFrequency')) {
                document.getElementById('reportFrequency').value = settings.reportFrequency || 'weekly';
            }
            if (document.getElementById('goalViewPreference')) {
                document.getElementById('goalViewPreference').value = settings.goalViewPreference || 'progress';
            }
            if (document.getElementById('parentTone')) {
                document.getElementById('parentTone').value = settings.parentTone || '';
            }
            if (document.getElementById('parentLanguage')) {
                document.getElementById('parentLanguage').value = settings.parentLanguage || 'English';
            }
        } catch (error) {
            console.error("ERROR: Failed to load parent settings:", error);
        }
    }

    // --- Event Listeners ---
    if (childSelector) {
        childSelector.addEventListener("change", () => {
            selectedChild = children.find(c => c._id === childSelector.value);
            if (parentChatContainer) parentChatContainer.innerHTML = '<p class="text-gray-500 text-center py-2">Chat about your child\'s progress.</p>';
            updateTutorAvatar(selectedChild);
        });
    }

    if (parentSendButton) {
        if (parentUserInput) {
            parentUserInput.addEventListener('input', () => {
                if (parentUserInput.value.length > PARENT_CHAT_MAX_MESSAGE_LENGTH) {
                    parentUserInput.value = parentUserInput.value.substring(0, PARENT_CHAT_MAX_MESSAGE_LENGTH);
                }
            });
        }

        parentSendButton.addEventListener("click", async () => {
            const message = parentUserInput.value.trim();
            if (!message || !selectedChild || !currentParentId) {
                showToast("Please select a child and type a message.", "warning");
                return;
            }
            if (message.length > PARENT_CHAT_MAX_MESSAGE_LENGTH) {
                showToast(`Message too long. Please shorten to under ${PARENT_CHAT_MAX_MESSAGE_LENGTH} characters.`, "warning");
                return;
            }

            appendParentMessage("user", message);
            parentUserInput.value = "";
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await csrfFetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({
                        userId: currentParentId,
                        message,
                        role: "parent",
                        childId: selectedChild._id,
                    })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Chat error: ${res.status} - ${errorText}`);
                }
                const data = await res.json();
                appendParentMessage("ai", data.text || "No response from tutor.", {
                    tutorName: data.tutorName,
                    tutorImage: data.tutorImage
                });
            } catch (err) {
                console.error("Parent chat error:", err);
                appendParentMessage("ai", "Error connecting to the tutor. Please try again.");
            } finally {
                if (parentThinkingIndicator) parentThinkingIndicator.style.display = "none";
            }
        });

        if (parentUserInput) {
            parentUserInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    parentSendButton.click();
                }
            });
        }
    }

    // --- Helper Button Click Handlers ---
    const helperButtons = document.querySelectorAll('.helper-btn');
    helperButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const message = btn.getAttribute('data-message');
            if (!message || !selectedChild || !currentParentId) {
                showToast("Please select a child first.", "warning");
                return;
            }

            appendParentMessage("user", message);
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await csrfFetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({
                        userId: currentParentId,
                        message,
                        role: "parent",
                        childId: selectedChild._id,
                    })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Chat error: ${res.status} - ${errorText}`);
                }
                const data = await res.json();
                appendParentMessage("ai", data.text || "No response from tutor.", {
                    tutorName: data.tutorName,
                    tutorImage: data.tutorImage
                });
            } catch (err) {
                console.error("Parent chat error:", err);
                appendParentMessage("ai", "Error connecting to the tutor. Please try again.");
            } finally {
                if (parentThinkingIndicator) parentThinkingIndicator.style.display = "none";
            }
        });
    });

    if (generateCodeBtn) {
        generateCodeBtn.addEventListener('click', async () => {
            generateCodeBtn.disabled = true;
            generateCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            try {
                const res = await csrfFetch("/api/parent/generate-invite-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    generatedCodeValue.textContent = data.code;
                    codeExpiresAt.textContent = new Date(data.expiresAt).toLocaleDateString();
                    inviteCodeOutput.style.display = 'block';

                    // Also update mobile code display
                    const mobileCodeEl = document.getElementById('mobile-generated-code-value');
                    if (mobileCodeEl) mobileCodeEl.textContent = data.code;

                    showToast("Invite code generated! Share it with your child.", "success");
                } else {
                    showToast("Failed to generate code: " + data.message, "error");
                }
            } catch (error) {
                console.error("ERROR: Generate code error:", error);
                showToast("An error occurred while generating code.", "error");
            } finally {
                generateCodeBtn.disabled = false;
                generateCodeBtn.innerHTML = '<i class="fas fa-key"></i> Generate Invite Code';
            }
        });
    }

    if (linkStudentForm) {
        linkStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentLinkCode = studentLinkCodeInput.value.trim();
            linkStudentMessage.textContent = '';
            try {
                const res = await csrfFetch("/api/parent/link-to-student", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({ studentLinkCode })
                });
                const data = await res.json();
                if (data.success) {
                    linkStudentMessage.className = "mt-2 text-sm text-green-600";
                    linkStudentMessage.textContent = data.message;
                    studentLinkCodeInput.value = '';
                    showToast(data.message, "success");
                    loadChildren(); // Reload children list after successful link
                } else {
                    linkStudentMessage.className = "mt-2 text-sm text-red-600";
                    linkStudentMessage.textContent = data.message;
                    showToast(data.message, "error");
                }
            } catch (error) {
                console.error("ERROR: Link student error:", error);
                linkStudentMessage.className = "mt-2 text-sm text-red-600";
                linkStudentMessage.textContent = "An error occurred while linking the student.";
                showToast("An error occurred while linking the student.", "error");
            }
        });
    }

    // --- Parent Settings Form Handler ---
    if (parentSettingsForm) {
        parentSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            settingsSaveMessage.textContent = '';

            const formData = {
                reportFrequency: document.getElementById('reportFrequency').value,
                goalViewPreference: document.getElementById('goalViewPreference').value,
                parentTone: document.getElementById('parentTone').value,
                parentLanguage: document.getElementById('parentLanguage').value
            };

            try {
                const res = await csrfFetch("/api/parent/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                const data = await res.json();
                if (data.success) {
                    settingsSaveMessage.className = "mt-2 text-sm text-green-600";
                    settingsSaveMessage.textContent = data.message;
                    showToast("Settings saved!", "success", 2000);
                    setTimeout(() => {
                        settingsSaveMessage.textContent = '';
                    }, 3000);
                } else {
                    settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                    settingsSaveMessage.textContent = data.message || 'Failed to save settings';
                    showToast("Failed to save settings.", "error");
                }
            } catch (error) {
                console.error("ERROR: Save settings error:", error);
                settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                settingsSaveMessage.textContent = "An error occurred while saving settings.";
                showToast("An error occurred while saving settings.", "error");
            }
        });
    }

    // --- Email Report Handlers ---
    const testEmailBtn = document.getElementById("test-email-btn");
    const sendWeeklyReportBtn = document.getElementById("send-weekly-report-btn");
    const emailStatusMessage = document.getElementById("email-status-message");

    if (testEmailBtn) {
        testEmailBtn.addEventListener("click", async () => {
            try {
                emailStatusMessage.textContent = "Sending test email...";
                emailStatusMessage.style.color = "var(--color-text-muted)";
                testEmailBtn.disabled = true;

                const response = await csrfFetch('/api/email/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "Test email sent! Check your inbox.";
                    emailStatusMessage.style.color = "var(--color-success)";
                    showToast("Test email sent! Check your inbox.", "success");
                } else {
                    emailStatusMessage.textContent = data.message;
                    emailStatusMessage.style.color = "var(--color-danger)";
                    showToast(data.message, "error");
                }

                testEmailBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending test email:", error);
                emailStatusMessage.textContent = "Error: Email not configured on server";
                emailStatusMessage.style.color = "var(--color-danger)";
                showToast("Email not configured on server.", "error");
                testEmailBtn.disabled = false;
            }
        });
    }

    if (sendWeeklyReportBtn) {
        sendWeeklyReportBtn.addEventListener("click", async () => {
            if (!selectedChild) {
                showToast("Please select a child first.", "warning");
                return;
            }

            try {
                emailStatusMessage.textContent = "Generating and sending report...";
                emailStatusMessage.style.color = "var(--color-text-muted)";
                sendWeeklyReportBtn.disabled = true;

                const response = await csrfFetch('/api/email/weekly-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: selectedChild._id })
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "Weekly report sent! Check your inbox.";
                    emailStatusMessage.style.color = "var(--color-success)";
                    showToast("Weekly report sent!", "success");
                } else {
                    emailStatusMessage.textContent = data.message;
                    emailStatusMessage.style.color = "var(--color-danger)";
                    showToast(data.message, "error");
                }

                sendWeeklyReportBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending weekly report:", error);
                emailStatusMessage.textContent = "Error: Email not configured on server";
                emailStatusMessage.style.color = "var(--color-danger)";
                showToast("Email not configured on server.", "error");
                sendWeeklyReportBtn.disabled = false;
            }
        });
    }

    // ============================================
    // PARENT LEARNING CENTER - Mini-Courses
    // ============================================

    async function loadParentCourses() {
        const container = document.getElementById('parent-courses-list');
        const mobileContainer = document.getElementById('mobile-parent-courses-list');
        if (!container) return;

        try {
            const [catalogRes, sessionsRes] = await Promise.all([
                csrfFetch('/api/course-sessions/catalog?audience=parent', { credentials: 'include' }),
                csrfFetch('/api/course-sessions', { credentials: 'include' })
            ]);

            const catalogData = catalogRes.ok ? await catalogRes.json() : { catalog: [] };
            const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
            const courses = catalogData.catalog || [];
            const sessions = sessionsData.sessions || [];

            const enrolledMap = {};
            sessions.forEach(s => {
                if (s.status === 'active' || s.status === 'paused') {
                    enrolledMap[s.courseId] = s;
                }
            });

            if (courses.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-500 text-center">Parent courses coming soon!</p>';
                if (mobileContainer) mobileContainer.innerHTML = container.innerHTML;
                return;
            }

            const html = courses.map(course => {
                const gradeBand = course.gradeBand || '';
                const desc = course.description || course.tagline || '';
                const truncatedDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
                const enrolled = enrolledMap[course.courseId];
                const progress = enrolled ? (enrolled.overallProgress || 0) : 0;

                let buttonHtml;
                if (enrolled) {
                    buttonHtml = `
                        <div class="parent-course-progress-bar">
                            <div class="parent-course-progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <button class="parent-course-enroll-btn enrolled" onclick="window.location.href='/parent-course.html?sessionId=${enrolled._id}&courseId=${course.courseId}'">
                            <i class="fas fa-arrow-right"></i> Continue (${progress}%)
                        </button>
                    `;
                } else {
                    buttonHtml = `
                        <button class="parent-course-enroll-btn" onclick="enrollParentCourse('${course.courseId}', this)">
                            <i class="fas fa-play-circle"></i> Start Course
                        </button>
                    `;
                }

                return `
                    <div class="parent-course-card${enrolled ? ' enrolled' : ''}" data-course-id="${course.courseId}">
                        <div class="parent-course-card-title">
                            <i class="fas fa-book-reader"></i>
                            ${course.title}
                        </div>
                        <div class="parent-course-card-desc">${truncatedDesc}</div>
                        <div class="parent-course-card-meta">
                            ${gradeBand ? `<span class="parent-course-badge badge-grade">${gradeBand}</span>` : ''}
                            <span class="parent-course-badge badge-units">${course.moduleCount || 4} topics</span>
                        </div>
                        ${buttonHtml}
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
            if (mobileContainer) mobileContainer.innerHTML = html;
        } catch (error) {
            console.error('Error loading parent courses:', error);
            container.innerHTML = '<p class="text-sm text-gray-500 text-center">Could not load courses.</p>';
            if (mobileContainer) mobileContainer.innerHTML = container.innerHTML;
        }
    }

    // Enroll in a parent course
    window.enrollParentCourse = async function(courseId, btnElement) {
        try {
            btnElement.disabled = true;
            btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enrolling...';

            const res = await csrfFetch('/api/course-sessions/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ courseId })
            });

            const data = await res.json();

            if (data.success) {
                btnElement.innerHTML = '<i class="fas fa-check-circle"></i> Enrolled!';
                btnElement.classList.add('enrolled');
                showToast("Course enrolled! Redirecting...", "success");
                const sessionId = data.session?._id || '';
                setTimeout(() => {
                    window.location.href = `/parent-course.html?sessionId=${sessionId}&courseId=${courseId}`;
                }, 800);
            } else {
                if (data.message && data.message.includes('Already enrolled')) {
                    btnElement.innerHTML = '<i class="fas fa-arrow-right"></i> Continue Course';
                    btnElement.classList.add('enrolled');
                    btnElement.disabled = false;
                    btnElement.onclick = () => { window.location.href = `/parent-course.html?courseId=${courseId}`; };
                } else {
                    btnElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Error'}`;
                    btnElement.disabled = false;
                    showToast(data.message || 'Enrollment failed.', 'error');
                    setTimeout(() => {
                        btnElement.innerHTML = '<i class="fas fa-play-circle"></i> Start Course';
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('Error enrolling in course:', error);
            btnElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
            btnElement.disabled = false;
            showToast('Error enrolling in course.', 'error');
            setTimeout(() => {
                btnElement.innerHTML = '<i class="fas fa-play-circle"></i> Start Course';
            }, 3000);
        }
    };

    // ============================================
    // INITIAL LOAD
    // ============================================

    setupCopyButtons();

    const parentUser = await loadParentUser();
    if (parentUser) {
        loadChildren();
        loadParentSettings();
        loadParentCourses();
    }

    // ============================================
    // REAL-TIME UPDATES
    // ============================================

    let parentPollingInterval = null;
    let lastLiveSessionCount = 0;

    function startParentPolling() {
        if (parentPollingInterval) return; // Prevent duplicate intervals
        parentPollingInterval = setInterval(async () => {
            if (children.length === 0) return;

            try {
                let currentLiveSessions = 0;

                // Parallel polling for all children
                const pollResults = await Promise.all(
                    children.map(async (child) => {
                        try {
                            const res = await fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' });
                            if (res.ok) {
                                const progress = await res.json();
                                const liveSessions = progress.recentSessions?.filter(s => s.isActive) || [];
                                return { childId: child._id, isLive: liveSessions.length > 0, liveCount: liveSessions.length };
                            }
                        } catch (err) {
                            console.log(`[Polling] Failed to check ${child.firstName}'s status`);
                        }
                        return { childId: child._id, isLive: false, liveCount: 0 };
                    })
                );

                pollResults.forEach(result => {
                    currentLiveSessions += result.liveCount;
                    updateChildLiveStatus(result.childId, result.isLive);
                });

                if (currentLiveSessions > lastLiveSessionCount && lastLiveSessionCount >= 0) {
                    showLiveSessionNotification(currentLiveSessions - lastLiveSessionCount);
                }
                lastLiveSessionCount = currentLiveSessions;

            } catch (error) {
                console.log('[Parent Polling] Error:', error.message);
            }
        }, 60000);
    }

    function stopParentPolling() {
        if (parentPollingInterval) {
            clearInterval(parentPollingInterval);
            parentPollingInterval = null;
        }
    }

    function updateChildLiveStatus(childId, isLive) {
        const cards = document.querySelectorAll('.child-card');
        cards.forEach(card => {
            if (card.dataset.childId !== childId) return;

            const cardHeader = card.querySelector('h3');
            if (!cardHeader) return;

            let liveIndicator = card.querySelector('.live-indicator');

            if (isLive && !liveIndicator) {
                liveIndicator = document.createElement('span');
                liveIndicator.className = 'live-indicator';
                liveIndicator.innerHTML = '<span class="live-badge-dot"></span> LIVE NOW';
                liveIndicator.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: var(--color-success); color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: bold; margin-left: 10px;';
                cardHeader.appendChild(liveIndicator);

                card.style.borderLeft = '4px solid var(--color-success)';
                card.style.boxShadow = '0 0 20px rgba(39, 174, 96, 0.2)';
            } else if (!isLive && liveIndicator) {
                liveIndicator.remove();
                card.style.borderLeft = '';
                card.style.boxShadow = '';
            }
        });
    }

    function showLiveSessionNotification(count) {
        showToast(
            count === 1
                ? 'Your child just started a learning session!'
                : `${count} children are now learning!`,
            'success',
            8000
        );

        // Play notification sound
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    // Start polling if we have children
    if (children.length > 0) {
        startParentPolling();
    }

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopParentPolling();
        } else {
            startParentPolling();
        }
    });

    window.addEventListener('beforeunload', stopParentPolling);
});
