// public/js/parent-dashboard.js
// MODIFIED: Updated to fetch progress and conversation summaries for each child
// individually from the new `/api/parent/child/:childId/progress` endpoint.

document.addEventListener("DOMContentLoaded", async () => {
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

    // --- Helper for appending messages to parent chat widget ---
    function appendParentMessage(sender, text) {
        const msg = document.createElement("div");
        msg.className = `message ${sender} message-widget`;
        msg.innerText = text;
        parentChatContainer.appendChild(msg);
        parentChatContainer.scrollTop = parentChatContainer.scrollHeight;
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
        card.innerHTML = `
            <div class="child-header">
                <h2>${progress.firstName || 'Unknown'} ${progress.lastName || 'Child'}</h2>
                <span class="child-stats">Level ${progress.level || '1'} — ${progress.xp || '0'} XP</span>
            </div>
            <div class="child-summary-details">
                ${progress.gradeLevel || 'N/A'} · ${progress.mathCourse || 'N/A'} · ${progress.totalActiveTutoringMinutes || '0'} min total
            </div>
            <div class="session-log-container">
                <strong>Recent Sessions:</strong>
                ${progress.recentSessions && progress.recentSessions.length > 0 ? progress.recentSessions.map(s => `
                    <div class="session-entry">
                        <strong>${new Date(s.date).toLocaleDateString()}:</strong> ${s.summary || 'No summary.'} <em>(${s.duration ? s.duration.toFixed(0) : 'N/A'} min)</em>
                    </div>
                `).join('') : '<p class="text-gray-500 text-sm">No recent sessions with summaries.</p>'}
            </div>
        `;
        childrenListContainer.appendChild(card);
    }


    // --- Event Listeners (No changes needed here) ---
    if (childSelector) {
        childSelector.addEventListener("change", () => {
            selectedChild = children.find(c => c._id === childSelector.value);
            if (parentChatContainer) parentChatContainer.innerHTML = '<p class="text-gray-500 text-center py-2">Chat about your child\'s progress.</p>';
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
                const res = await fetch("/api/chat", { // Note: The parent chat endpoint is currently the main chat endpoint
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
                appendParentMessage("ai", data.text || "No response from tutor.");
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

    if (generateCodeBtn) {
        generateCodeBtn.addEventListener('click', async () => {
            try {
                const res = await fetch("/api/parent/generate-invite-code", {
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
                const res = await fetch("/api/parent/link-to-student", {
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

    // Initial load
    const parentUser = await loadParentUser();
    if (parentUser) {
        loadChildren();
    }
});