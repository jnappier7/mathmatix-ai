// public/js/parent-dashboard.js
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

    // --- Function to Load and Display Children (for dashboard and chat selector) ---
    async function loadChildren() {
        if (loadingChildren) loadingChildren.style.display = 'block';
        if (childrenListContainer) childrenListContainer.innerHTML = '';
        if (childSelector) childSelector.innerHTML = '<option value="">Select Child</option>';

        try {
            const res = await fetch("/api/parent/children", { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    alert("Session expired or unauthorized. Please log in again.");
                    window.location.href = "/login.html";
                    return;
                }
                const errorText = await res.text();
                throw new Error(`HTTP error! status: ${res.status} - ${errorText}`);
            }
            const fetchedChildren = await res.json();
            children = fetchedChildren;

            if (loadingChildren) loadingChildren.style.display = 'none';

            if (children.length === 0) {
                childrenListContainer.innerHTML = `<p class="text-center text-gray-500 py-4">No children linked yet. Generate an invite code or link to an existing student!</p>`;
                if (childSelector) childSelector.disabled = true;
                if (parentUserInput) parentUserInput.disabled = true;
                if (parentSendButton) parentSendButton.disabled = true;
            } else {
                childrenListContainer.innerHTML = '';
                children.forEach((child, i) => {
                    const option = document.createElement('option');
                    option.value = child._id;
                    option.textContent = `${child.firstName} ${child.lastName} (${child.gradeLevel || "?"})`;
                    childSelector.appendChild(option);
                    if (i === 0) { // Select the first child by default
                        selectedChild = child;
                        childSelector.value = child._id; // Ensure the dropdown reflects the selection
                    }
                });
                if (childSelector) childSelector.disabled = false;
                if (parentUserInput) parentUserInput.disabled = false;
                if (parentSendButton) parentSendButton.disabled = false;
                if (parentChatContainer) parentChatContainer.innerHTML = '<p class="text-gray-500 text-center py-2">Chat about your child\'s progress.</p>';

                // Load progress for each child
                for (const child of children) {
                    let progress;
                    try {
                        const progressRes = await fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' });
                        if (!progressRes.ok) {
                            const errorText = await progressRes.text();
                            throw new Error(`Failed to load progress for ${child.firstName}: ${progressRes.status} - ${errorText}`);
                        }
                        progress = await progressRes.json();
                    } catch (progressErr) {
                        console.error(`ERROR: Could not fetch progress for child ${child._id}:`, progressErr);
                        progress = {
                            firstName: child.firstName,
                            lastName: child.lastName,
                            level: 'N/A',
                            xp: 'N/A',
                            gradeLevel: 'Unknown',
                            mathCourse: 'Unknown',
                            totalActiveTutoringMinutes: '0',
                            recentSessions: []
                        };
                    }

                    const card = document.createElement('div');
                    card.className = 'child-card';

                    card.innerHTML = `
                        <div class="child-header">
                            <h2>${progress.firstName || 'Unknown'} ${progress.lastName || 'Child'}</h2>
                            <span class="child-stats">Level ${progress.level || '1'} — ${progress.xp || '0'} XP</span>
                        </div>
                        <div class="child-summary-details">
                            ${progress.gradeLevel || 'Unknown Grade'} · ${progress.mathCourse || 'Unknown Course'} · ${progress.totalActiveTutoringMinutes || '0'} min tutored
                        </div>
                        <div class="session-log-container">
                            <strong>Recent Sessions:</strong>
                            ${progress.recentSessions && progress.recentSessions.length > 0 ? progress.recentSessions.map(s => `
                                <div class="session-entry">
                                    <strong>${new Date(s.date).toLocaleDateString()}:</strong> ${s.summary || 'No summary'} <em>(${s.duration ? s.duration.toFixed(0) : 'N/A'} min)</em>
                                </div>
                            `).join('') : '<p class="text-gray-500 text-sm">No recent sessions.</p>'}
                        </div>
                    `;
                    childrenListContainer.appendChild(card);
                }
            }
        } catch (error) {
            console.error("Parent dashboard error fetching children list:", error);
            if (loadingChildren) loadingChildren.style.display = 'none';
            if (childrenListContainer) childrenListContainer.innerHTML = `<p class="text-center text-red-500 py-4">Failed to load children. Please try again or ensure you are logged in.</p>`;
        }
    }

    // --- Parent Chat Selector Change Listener ---
    if (childSelector) {
        childSelector.addEventListener("change", () => {
            selectedChild = children.find(c => c._id === childSelector.value);
            if (parentChatContainer) parentChatContainer.innerHTML = '<p class="text-gray-500 text-center py-2">Chat about your child\'s progress.</p>';
        });
    }

    // --- Parent Chat Send Message Logic ---
    if (parentSendButton) {
        parentSendButton.addEventListener("click", async () => {
            const message = parentUserInput.value.trim();
            if (!message || !selectedChild || !currentParentId) {
                alert("Please ensure you are logged in, select a child, and type a message.");
                return;
            }

            appendParentMessage("user", message);
            parentUserInput.value = "";
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await fetch("/chat", { // Assuming /chat endpoint handles parent messages
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({
                        userId: currentParentId,
                        message,
                        role: "parent", // Indicate sender role
                        childId: selectedChild._id, // Send selected child's ID
                    })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Chat error: ${res.status} - ${errorText}`);
                }

                const data = await res.json();
                appendParentMessage("ai", data.text || "⚠️ No response from tutor.");
            } catch (err) {
                console.error("Parent chat error:", err);
                appendParentMessage("ai", "⚠️ Error. Please try again.");
            } finally {
                if (parentThinkingIndicator) parentThinkingIndicator.style.display = "none";
            }
        });

        // Enable sending with Enter key for parent chat
        if (parentUserInput) {
            parentUserInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) { // Enter without Shift
                    e.preventDefault(); // Prevent new line
                    parentSendButton.click(); // Trigger send button click
                }
            });
        }
    }


    // --- Generate Invite Code Logic ---
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
                    alert(data.message + "\nCode: " + data.code);
                } else {
                    alert("Failed to generate code: " + data.message);
                }
            } catch (error) {
                console.error("ERROR: Generate code error:", error);
                alert("An error occurred while generating code.");
            }
        });
    }

    // --- Link to Student Form Logic ---
    if (linkStudentForm) {
        linkStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentLinkCode = studentLinkCodeInput.value.trim();
            linkStudentMessage.textContent = ''; // Clear previous messages

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
                    studentLinkCodeInput.value = ''; // Clear input field
                    loadChildren(); // Reload children list after successful link
                } else {
                    linkStudentMessage.className = "mt-2 text-sm text-red-600";
                    linkStudentMessage.textContent = data.message;
                }
            } catch (error) {
                console.error("ERROR: Link student error:", error);
                linkStudentMessage.className = "mt-2 text-sm text-red-600";
                linkStudentMessage.textContent = "An error occurred while linking student.";
            }
        });
    }

    // Initial load of parent user data and then children
    const parentUser = await loadParentUser();
    if (parentUser) {
        loadChildren();
    }
});// JavaScript Document