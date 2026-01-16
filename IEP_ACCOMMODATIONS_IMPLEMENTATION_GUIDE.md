# IEP Accommodations Frontend Implementation Guide

## Issue Summary

There is currently a **mismatch** between the IEP accommodations available in the **data model** versus what's displayed in the **teacher dashboard UI**. This guide will help you align the frontend with the backend.

---

## Current State Analysis

### Backend Data Model (`models/user.js` lines 23-34)

The `iepAccommodationsSchema` supports these fields:

```javascript
{
  extendedTime: Boolean,              // ✅ In UI
  reducedDistraction: Boolean,        // ✅ In UI
  calculatorAllowed: Boolean,         // ❌ MISSING from UI
  audioReadAloud: Boolean,            // ❌ MISSING from UI
  chunkedAssignments: Boolean,        // ⚠️  In UI as "chunking"
  breaksAsNeeded: Boolean,            // ❌ MISSING from UI
  digitalMultiplicationChart: Boolean, // ❌ MISSING from UI
  largePrintHighContrast: Boolean,    // ❌ MISSING from UI
  mathAnxietySupport: Boolean,        // ✅ In UI as "mathAnxiety"
  custom: [String]                    // ❌ MISSING from UI
}
```

### Frontend UI (`public/teacher-dashboard.html` lines 895-903)

Current checkboxes in the IEP modal:

```html
<label><input type="checkbox" id="extendedTime" /> Extended Time</label>
<label><input type="checkbox" id="simplifiedInstructions" /> Simplified Instructions</label> ❌ NOT in model
<label><input type="checkbox" id="iepFrequentCheckIns" /> Frequent Check-ins</label> ❌ NOT in model
<label><input type="checkbox" id="visualSupport" /> Visual Support</label> ❌ NOT in model
<label><input type="checkbox" id="chunking" /> Chunking (Break down tasks)</label> ⚠️ Should be "chunkedAssignments"
<label><input type="checkbox" id="reducedDistraction" /> Reduced Distraction</label>
<label><input type="checkbox" id="mathAnxiety" /> Math Anxiety Support</label> ⚠️ Should be "mathAnxietySupport"
```

### Frontend JavaScript (`public/js/teacher-dashboard.js` lines 16-25)

The JavaScript references fields that don't match the model:

```javascript
const iepAccommodations = {
    extendedTime: document.getElementById("extendedTime"),
    simplifiedInstructions: document.getElementById("simplifiedInstructions"), // ❌
    frequentCheckIns: document.getElementById("iepFrequentCheckIns"),         // ❌
    visualSupport: document.getElementById("visualSupport"),                   // ❌
    chunking: document.getElementById("chunking"),                             // ⚠️
    reducedDistraction: document.getElementById("reducedDistraction"),
    mathAnxiety: document.getElementById("mathAnxiety")                       // ⚠️
};
```

---

## Implementation Tasks

### Task 1: Update HTML Checkboxes

**File:** `public/teacher-dashboard.html`

**Location:** Lines 894-903 (inside the `#iep-editor-modal`)

**Action:** Replace the existing checkbox group with the correct accommodations:

```html
<h3>Accommodations</h3>
<div class="checkbox-group">
  <label><input type="checkbox" id="extendedTime" /> Extended Time</label>
  <label><input type="checkbox" id="reducedDistraction" /> Reduced Distraction</label>
  <label><input type="checkbox" id="calculatorAllowed" /> Calculator Allowed</label>
  <label><input type="checkbox" id="audioReadAloud" /> Audio Read-Aloud</label>
  <label><input type="checkbox" id="chunkedAssignments" /> Chunked Assignments</label>
  <label><input type="checkbox" id="breaksAsNeeded" /> Breaks as Needed</label>
  <label><input type="checkbox" id="digitalMultiplicationChart" /> Digital Multiplication Chart</label>
  <label><input type="checkbox" id="largePrintHighContrast" /> Large Print / High Contrast</label>
  <label><input type="checkbox" id="mathAnxietySupport" /> Math Anxiety Support</label>
</div>

<label for="customAccommodations">Custom Accommodations (one per line):</label>
<textarea id="customAccommodations" rows="3" placeholder="Enter any additional accommodations..."></textarea>
```

**What changed:**
- ✅ Removed: `simplifiedInstructions`, `iepFrequentCheckIns`, `visualSupport`
- ✅ Added: `calculatorAllowed`, `audioReadAloud`, `breaksAsNeeded`, `digitalMultiplicationChart`, `largePrintHighContrast`
- ✅ Renamed: `chunking` → `chunkedAssignments`, `mathAnxiety` → `mathAnxietySupport`
- ✅ Added: `customAccommodations` textarea for the `custom` array

---

### Task 2: Update JavaScript Field References

**File:** `public/js/teacher-dashboard.js`

**Location:** Lines 16-25 (IEP Accommodations object)

**Action:** Update the `iepAccommodations` object to match the new IDs:

```javascript
// IEP Form Elements
const iepAccommodations = {
    extendedTime: document.getElementById("extendedTime"),
    reducedDistraction: document.getElementById("reducedDistraction"),
    calculatorAllowed: document.getElementById("calculatorAllowed"),
    audioReadAloud: document.getElementById("audioReadAloud"),
    chunkedAssignments: document.getElementById("chunkedAssignments"),
    breaksAsNeeded: document.getElementById("breaksAsNeeded"),
    digitalMultiplicationChart: document.getElementById("digitalMultiplicationChart"),
    largePrintHighContrast: document.getElementById("largePrintHighContrast"),
    mathAnxietySupport: document.getElementById("mathAnxietySupport")
};

const customAccommodationsInput = document.getElementById("customAccommodations");
```

---

### Task 3: Update `loadIepData` Function

**File:** `public/js/teacher-dashboard.js`

**Location:** Lines 86-93 (loadIepData function)

**Action:** Add support for loading custom accommodations:

```javascript
const loadIepData = (iepPlan = {}) => {
    const accommodations = iepPlan.accommodations || {};

    // Load checkboxes
    Object.keys(iepAccommodations).forEach(key => {
        if(iepAccommodations[key]) {
            iepAccommodations[key].checked = accommodations[key] || false;
        }
    });

    // Load custom accommodations
    if (customAccommodationsInput) {
        customAccommodationsInput.value = (accommodations.custom || []).join('\n');
    }

    // Load other fields
    if(readingLevelInput) readingLevelInput.value = iepPlan.readingLevel || '';
    if(preferredScaffoldsInput) preferredScaffoldsInput.value = (iepPlan.preferredScaffolds || []).join(', ');

    // Load goals
    renderIepGoals(iepPlan.goals || []);
};
```

**What changed:**
- ✅ Added logic to load `custom` array into the textarea (one per line)

---

### Task 4: Update `getIepFormData` Function

**File:** `public/js/teacher-dashboard.js`

**Location:** Lines 95-113 (getIepFormData function)

**Action:** Add support for saving custom accommodations:

```javascript
const getIepFormData = () => {
    // Get goals from form
    const goals = Array.from(document.querySelectorAll('.iep-goal-item')).map(item => ({
        description: item.querySelector('.goal-description').value,
        targetDate: item.querySelector('.goal-target-date').value,
        currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
        measurementMethod: item.querySelector('.goal-measurement').value,
        status: item.querySelector('.goal-status').value,
    }));

    // Build accommodations object
    const accommodations = Object.fromEntries(
        Object.entries(iepAccommodations).map(([key, el]) => [key, el.checked])
    );

    // Add custom accommodations array
    if (customAccommodationsInput && customAccommodationsInput.value.trim()) {
        accommodations.custom = customAccommodationsInput.value
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
    } else {
        accommodations.custom = [];
    }

    return {
        accommodations,
        readingLevel: parseFloat(readingLevelInput.value) || null,
        preferredScaffolds: preferredScaffoldsInput.value.split(',').map(s => s.trim()).filter(Boolean),
        goals
    };
};
```

**What changed:**
- ✅ Added logic to parse `customAccommodations` textarea into an array (split by newline)
- ✅ Trim whitespace and filter empty lines

---

### Task 5: Update Parent Dashboard Display (Optional Enhancement)

**File:** `public/js/parent-dashboard.js`

**Location:** Lines 184-213 (renderChildCard function)

The parent dashboard already displays IEP accommodations correctly! It dynamically reads from the `iepPlan.accommodations` object, so once you fix the teacher dashboard, the parent view will automatically show the correct accommodations.

**Optional:** If you want to display custom accommodations in the parent view, add this after line 200:

```javascript
if (accom.custom && accom.custom.length > 0) {
    activeAccommodations.push(...accom.custom);
}
```

(Actually, this is already there! Lines 199-201. You're good to go!)

---

## Testing Checklist

### ✅ Teacher Dashboard - IEP Editor

1. **Load existing IEP data:**
   - [ ] Open teacher dashboard
   - [ ] Click "View IEP" on a student
   - [ ] Verify all 9 standard accommodations display correctly
   - [ ] Verify custom accommodations (if any) display in the textarea

2. **Edit and save IEP:**
   - [ ] Check/uncheck several standard accommodations
   - [ ] Add custom accommodations in the textarea (one per line)
   - [ ] Save the IEP
   - [ ] Verify success message appears
   - [ ] Re-open the IEP modal
   - [ ] Verify all changes persisted

3. **Test edge cases:**
   - [ ] Save IEP with no accommodations checked
   - [ ] Save IEP with only custom accommodations
   - [ ] Save IEP with blank lines in custom accommodations textarea
   - [ ] Verify empty lines are filtered out

### ✅ Parent Dashboard - IEP Display

1. **View child accommodations:**
   - [ ] Log in as parent
   - [ ] View child progress card
   - [ ] Verify "Active Accommodations" section displays all enabled accommodations
   - [ ] Verify custom accommodations appear in the list

### ✅ Admin Dashboard - IEP Management

The admin dashboard uses the same IEP modal as the teacher dashboard (shared modal component), so:
- [ ] Repeat teacher dashboard tests from admin account
- [ ] Verify admins can edit IEP for any student

---

## API Endpoints (Already Implemented - No Changes Needed)

The backend API already supports the full accommodation model:

### Teacher Routes
- **GET** `/api/teacher/students/:studentId/iep` - Fetch student IEP
- **PUT** `/api/teacher/students/:studentId/iep` - Update student IEP

### Admin Routes
- **GET** `/api/admin/students/:studentId/iep` - Fetch student IEP
- **PUT** `/api/admin/students/:studentId/iep` - Update student IEP

### Parent Routes (Read-Only)
- **GET** `/api/parent/child/:childId/progress` - Includes IEP data

---

## File Summary

Files you need to edit:

1. ✅ `public/teacher-dashboard.html` (lines 894-903 + add textarea)
2. ✅ `public/js/teacher-dashboard.js` (lines 16-25, 86-93, 95-113)
3. ⚠️ `public/admin-dashboard.html` (check if it uses same IEP modal or separate one)
4. ⚠️ `public/js/admin-dashboard.js` (if admin has separate IEP logic)

---

## Expected Outcome

After implementing these changes:

1. ✅ Teacher can view and edit all 9 standard accommodations
2. ✅ Teacher can add/edit custom accommodations (free-text)
3. ✅ Parent can view all active accommodations (standard + custom)
4. ✅ Admin has full access to IEP editing
5. ✅ Frontend matches backend data model exactly
6. ✅ No data loss when saving/loading IEPs

---

## Additional Notes

### Why this matters:

IEP accommodations are **legally required** for students with disabilities. The accommodations must be:
- Accurately documented
- Accessible to teachers and parents
- Used by the AI tutor to personalize instruction

### How AI uses IEP data:

The AI tutor's system prompt (`utils/prompt.js`) includes IEP accommodations to:
- Adjust language complexity (reading level)
- Provide more scaffolding (chunked assignments, breaks)
- Enable calculator use in problems
- Offer audio read-aloud support
- Reduce math anxiety through encouraging tone

### Future enhancements:

- **Auto-detect:** Use AI to suggest accommodations based on student struggles
- **Progress tracking:** Track which accommodations are most effective
- **IEP goal progress:** Visualize progress toward IEP goals over time
- **Export:** Generate PDF IEP reports for school compliance

---

## Questions?

If you encounter issues:

1. Check browser console for JavaScript errors
2. Verify field IDs match between HTML and JS
3. Test API endpoints directly (use browser dev tools Network tab)
4. Check MongoDB to see if data is saving correctly

Good luck with the implementation! 🎉
