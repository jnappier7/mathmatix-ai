// public/js/parent-dashboard.js
// MODIFIED: Updated to fetch progress and conversation summaries for each child
// individually from the new `/api/parent/child/:childId/progress` endpoint.

document.addEventListener("DOMContentLoaded", async () => {
    // Add pulse animation for LIVE badge
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    `;
    document.head.appendChild(style);

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
                alert("Session expired or unauthorized. Please log in again.");
                window.location.href = "/login.html";
                return null;
            }
            const data = await res.json();
            currentParentId = data.user._id;
            return data.user;
        } catch (error) {
            console.error("ERROR: Failed to load parent user data:", error);
            alert("Could not load parent session. Please log in again.");
            window.location.href = "/login.html";
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
        } else {
            container.style.justifyContent = 'flex-start';
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

    // --- MODIFICATION: Updated function to load children and their progress ---
    async function loadChildren() {
        if (loadingChildren) loadingChildren.style.display = 'block';
        if (childrenListContainer) childrenListContainer.innerHTML = '';
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

            // Step 2: Populate dropdown and fetch progress for each child
            childrenListContainer.innerHTML = '';
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

            // Step 3: Iterate and render progress cards
            for (const child of children) {
                try {
                    const progressRes = await fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' });
                    if (!progressRes.ok) {
                        throw new Error(`Failed to load progress for ${child.firstName}`);
                    }
                    const progress = await progressRes.json();
                    renderChildCard(progress);
                } catch (progressErr) {
                    console.error(`Could not fetch progress for child ${child._id}:`, progressErr);
                    // Render a card with an error state
                    const errorCard = document.createElement('div');
                    errorCard.className = 'child-card';
                    errorCard.innerHTML = `<h2>${child.firstName} ${child.lastName}</h2><p class="text-red-500">Could not load progress data.</p>`;
                    childrenListContainer.appendChild(errorCard);
                }
            }

        } catch (error) {
            console.error("Parent dashboard error fetching children list:", error);
            if (loadingChildren) loadingChildren.style.display = 'none';
            if (childrenListContainer) childrenListContainer.innerHTML = `<p class="text-center text-red-500 py-4">Failed to load children data. Please try refreshing.</p>`;
        }
    }

    function renderChildCard(progress) {
        const card = document.createElement('div');
        card.className = 'child-card';

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

        // Build IEP goals display
        let goalsHTML = '';
        if (progress.iepPlan && progress.iepPlan.goals && progress.iepPlan.goals.length > 0) {
            goalsHTML = `
                <div class="iep-goals" style="margin-top: 12px;">
                    <strong><i class="fas fa-bullseye"></i> IEP Goals:</strong>
                    <div style="margin-top: 8px;">
                        ${progress.iepPlan.goals.map(goal => {
                            const statusColor = goal.status === 'completed' ? 'green' :
                                              goal.status === 'on-hold' ? 'orange' : 'blue';
                            const progressPercent = goal.currentProgress || 0;
                            return `
                                <div style="margin-bottom: 12px; padding: 10px; background: #f9f9f9; border-left: 4px solid ${statusColor}; border-radius: 4px;">
                                    <div style="font-weight: 600; margin-bottom: 4px;">${goal.description}</div>
                                    <div style="font-size: 0.85em; color: #666;">
                                        <span>Status: <strong>${goal.status}</strong></span> |
                                        <span>Progress: <strong>${progressPercent}%</strong></span>
                                        ${goal.targetDate ? ` | Target: <strong>${new Date(goal.targetDate).toLocaleDateString()}</strong>` : ''}
                                    </div>
                                    ${goal.measurementMethod ? `<div style="font-size: 0.8em; color: #888; margin-top: 4px;">Measured by: ${goal.measurementMethod}</div>` : ''}
                                    <div class="progress-bar" style="width: 100%; height: 6px; background: #e0e0e0; border-radius: 3px; margin-top: 6px; overflow: hidden;">
                                        <div style="width: ${progressPercent}%; height: 100%; background: ${statusColor}; transition: width 0.3s;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="child-header">
                <div>
                    <h2>${progress.firstName || 'Unknown'} ${progress.lastName || 'Child'}</h2>
                    <span class="child-stats">Level ${progress.level || '1'} — ${progress.xp || '0'} XP</span>
                </div>
                <button class="view-as-child-btn" data-childid="${progress._id}" data-childname="${progress.firstName || 'Child'}" title="See what ${progress.firstName || 'your child'} sees" style="background: #9b59b6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9em; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
            <div class="child-summary-details">
                ${progress.gradeLevel || 'N/A'} · ${progress.mathCourse || 'N/A'} · ${progress.totalActiveTutoringMinutes || '0'} min total
            </div>

            ${accommodationsHTML}
            ${goalsHTML}

            <div class="session-log-container" style="margin-top: 12px;">
                <strong>Recent Sessions:</strong>
                ${progress.recentSessions && progress.recentSessions.length > 0 ? progress.recentSessions
                    .filter(s => {
                        // Filter out sessions with bad/prompt summaries or invalid dates
                        if (!s.date) return false;
                        if (!s.summary) return false;
                        // Filter out summaries that are actually AI prompts (contain prompt keywords)
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
                        const liveBadge = s.isActive ? '<span style="background: #27ae60; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: bold; margin-right: 8px; animation: pulse 2s infinite;">🟢 LIVE</span>' : '';
                        const entryStyle = s.isActive ? 'background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-left: 4px solid #27ae60;' : '';
                        return `
                        <div class="session-entry" style="${entryStyle}">
                            ${liveBadge}<strong>${dateStr}:</strong> ${s.summary} <em>(${s.duration ? s.duration.toFixed(0) : 'N/A'} min)</em>
                        </div>
                    `;
                    }).join('') || '<p class="text-gray-500 text-sm">No recent sessions with summaries.</p>'
                : '<p class="text-gray-500 text-sm">No recent sessions with summaries.</p>'}
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
                    // Redirect happens automatically in the start function
                } catch (error) {
                    console.error('Failed to start child view:', error);
                    alert(error.message || 'Failed to start child view. Please try again.');
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
                alert("Please select a child and type a message.");
                return;
            }
            if (message.length > PARENT_CHAT_MAX_MESSAGE_LENGTH) {
                 alert(`Your message is too long. Please shorten it to under ${PARENT_CHAT_MAX_MESSAGE_LENGTH} characters.`);
                 return;
            }

            appendParentMessage("user", message);
            parentUserInput.value = "";
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await csrfFetch("/api/chat", { // Note: The parent chat endpoint is currently the main chat endpoint
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
                // Pass tutor info from response to show avatar with correct tutor
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
    // These buttons let parents quickly ask common questions
    const helperButtons = document.querySelectorAll('.helper-btn');
    helperButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const message = btn.getAttribute('data-message');
            if (!message || !selectedChild || !currentParentId) {
                alert("Please select a child first.");
                return;
            }

            // Show user's question in chat
            appendParentMessage("user", message);

            // Show thinking indicator
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
                // Pass tutor info from response
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
                } else {
                    alert("Failed to generate code: " + data.message);
                }
            } catch (error) {
                console.error("ERROR: Generate code error:", error);
                alert("An error occurred while generating code.");
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
                    loadChildren(); // Reload children list after successful link
                } else {
                    linkStudentMessage.className = "mt-2 text-sm text-red-600";
                    linkStudentMessage.textContent = data.message;
                }
            } catch (error) {
                console.error("ERROR: Link student error:", error);
                linkStudentMessage.className = "mt-2 text-sm text-red-600";
                linkStudentMessage.textContent = "An error occurred while linking the student.";
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
                    setTimeout(() => {
                        settingsSaveMessage.textContent = '';
                    }, 3000);
                } else {
                    settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                    settingsSaveMessage.textContent = data.message || 'Failed to save settings';
                }
            } catch (error) {
                console.error("ERROR: Save settings error:", error);
                settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                settingsSaveMessage.textContent = "An error occurred while saving settings.";
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
                emailStatusMessage.style.color = "#666";
                testEmailBtn.disabled = true;

                const response = await csrfFetch('/api/email/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})  // Will use current user's email
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "✅ Test email sent! Check your inbox.";
                    emailStatusMessage.style.color = "#27ae60";
                } else {
                    emailStatusMessage.textContent = `❌ ${data.message}`;
                    emailStatusMessage.style.color = "#e74c3c";
                }

                testEmailBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending test email:", error);
                emailStatusMessage.textContent = "❌ Error: Email not configured on server";
                emailStatusMessage.style.color = "#e74c3c";
                testEmailBtn.disabled = false;
            }
        });
    }

    if (sendWeeklyReportBtn) {
        sendWeeklyReportBtn.addEventListener("click", async () => {
            if (!selectedChild) {
                emailStatusMessage.textContent = "⚠️ Please select a child first";
                emailStatusMessage.style.color = "#f39c12";
                return;
            }

            try {
                emailStatusMessage.textContent = "Generating and sending report...";
                emailStatusMessage.style.color = "#666";
                sendWeeklyReportBtn.disabled = true;

                const response = await csrfFetch('/api/email/weekly-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: selectedChild._id })
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "✅ Weekly report sent! Check your inbox.";
                    emailStatusMessage.style.color = "#27ae60";
                } else {
                    emailStatusMessage.textContent = `❌ ${data.message}`;
                    emailStatusMessage.style.color = "#e74c3c";
                }

                sendWeeklyReportBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending weekly report:", error);
                emailStatusMessage.textContent = "❌ Error: Email not configured on server";
                emailStatusMessage.style.color = "#e74c3c";
                sendWeeklyReportBtn.disabled = false;
            }
        });
    }

    // Initial load (logout button handled by /js/logout.js)
    const parentUser = await loadParentUser();
    if (parentUser) {
        loadChildren();
        loadParentSettings();
    }

    // ============================================
    // REAL-TIME UPDATES (3x Better UX)
    // ============================================

    let parentPollingInterval = null;
    let lastLiveSessionCount = 0;

    function startParentPolling() {
        // Poll every 60 seconds for live session updates
        parentPollingInterval = setInterval(async () => {
            if (children.length === 0) return;

            try {
                // Check for live sessions
                let currentLiveSessions = 0;

                for (const child of children) {
                    try {
                        const res = await fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' });
                        if (res.ok) {
                            const progress = await res.json();
                            const liveSessions = progress.recentSessions?.filter(s => s.isActive) || [];
                            currentLiveSessions += liveSessions.length;

                            // Update live indicator on child cards
                            updateChildLiveStatus(child._id, liveSessions.length > 0);
                        }
                    } catch (err) {
                        console.log(`[Polling] Failed to check ${child.firstName}'s status`);
                    }
                }

                // Notify if a child just started a session
                if (currentLiveSessions > lastLiveSessionCount && lastLiveSessionCount >= 0) {
                    showLiveSessionNotification(currentLiveSessions - lastLiveSessionCount);
                }
                lastLiveSessionCount = currentLiveSessions;

            } catch (error) {
                console.log('[Parent Polling] Error:', error.message);
            }
        }, 60000); // Check every 60 seconds
    }

    function stopParentPolling() {
        if (parentPollingInterval) {
            clearInterval(parentPollingInterval);
            parentPollingInterval = null;
        }
    }

    function updateChildLiveStatus(childId, isLive) {
        // Find the child card and update its live indicator
        const cards = document.querySelectorAll('.child-card');
        cards.forEach(card => {
            // Check if this card is for the right child
            const childName = children.find(c => c._id === childId);
            if (!childName) return;

            const fullName = `${childName.firstName} ${childName.lastName}`;
            const cardHeader = card.querySelector('h2');
            if (cardHeader && cardHeader.textContent.includes(childName.firstName)) {
                // Add or remove live indicator
                let liveIndicator = card.querySelector('.live-indicator');

                if (isLive && !liveIndicator) {
                    liveIndicator = document.createElement('span');
                    liveIndicator.className = 'live-indicator';
                    liveIndicator.innerHTML = '<span class="live-dot"></span> LIVE NOW';
                    liveIndicator.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: #27ae60; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: bold; margin-left: 10px;';
                    cardHeader.appendChild(liveIndicator);

                    // Highlight the card
                    card.style.borderLeft = '4px solid #27ae60';
                    card.style.boxShadow = '0 0 20px rgba(39, 174, 96, 0.2)';
                } else if (!isLive && liveIndicator) {
                    liveIndicator.remove();
                    card.style.borderLeft = '';
                    card.style.boxShadow = '';
                }
            }
        });
    }

    function showLiveSessionNotification(count) {
        // Create notification banner
        let notification = document.getElementById('live-session-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'live-session-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #27ae60, #2ecc71);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(39, 174, 96, 0.4);
                z-index: 10000;
                animation: slideIn 0.3s ease;
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            document.body.appendChild(notification);
        }

        notification.innerHTML = `
            <span style="font-size: 1.5em;">📚</span>
            <div>
                <div style="font-weight: 600;">Your child is learning!</div>
                <div style="font-size: 0.85em; opacity: 0.9;">${count === 1 ? 'A session just started' : `${count} sessions active`}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.3em; cursor: pointer; margin-left: 10px;">&times;</button>
        `;

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification && notification.parentElement) {
                notification.remove();
            }
        }, 10000);

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

    // Add slideIn animation
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .live-dot {
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            animation: pulse 1s infinite;
        }
    `;
    document.head.appendChild(styleEl);
});