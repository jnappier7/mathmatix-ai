# Visual Learning Syntax Guide for AI Tutors

This guide explains special syntax that AI tutors can use to create visual, step-by-step explanations for students.

## 1. Visual Step Breadcrumbs `[STEPS]...[/STEPS]`

**Purpose:** Show equation transformations step-by-step with visual arrows

**Syntax:**
```
[STEPS]
3(x + 2) = 15
Distribute the 3
3x + 6 = 15
Subtract 6 from both sides
3x = 9
Divide both sides by 3
x = 3
[/STEPS]
```

**Renders as:**
- Blue gradient box with left border
- Equations in white cards with proper spacing
- Blue downward arrows (↓) between steps
- Explanatory text in smaller blue font

**Best for:** Algebra, equation solving, step-by-step calculations

---

## 2. Color-Coded Highlights

**Purpose:** Show what changed, what's new, or what to focus on

### Removed/Changed Terms `[OLD:...]`
Shows terms being removed or changed (red with strikethrough)

**Example:**
```
5x + [OLD:7] = [OLD:22]
```
**Renders:** 7 and 22 appear with red background and strikethrough

### New/Added Terms `[NEW:...]`
Shows new terms or results (green background)

**Example:**
```
After subtracting 7: 5x = [NEW:15]
```
**Renders:** 15 appears with green background

### Focus Terms `[FOCUS:...]`
Highlights the term you're currently working on (blue with border)

**Example:**
```
Let's isolate [FOCUS:x] by dividing both sides by 5
```
**Renders:** 'x' appears with blue background and blue border

**Combined Example:**
```
We had: 5x + [OLD:7] = 22
After subtracting 7 from both sides: 5x = [NEW:15]
Now divide both sides by 5 to get [FOCUS:x] alone
```

---

## When to Use Visual Features

### Use STEPS for:
- Solving multi-step equations
- Simplifying expressions
- Factoring
- Completing the square
- Any process with clear sequential steps

### Use Highlights for:
- Showing what changes between steps
- Emphasizing the important part of an equation
- Teaching substitution or elimination
- Demonstrating the distributive property

---

## Examples in Context

### Example 1: Solving an Equation
```
Let's solve 3(x + 2) = 15 step by step:

[STEPS]
3(x + 2) = 15
Distribute the 3
3x + 6 = 15
Subtract 6 from both sides
3x = 9
Divide both sides by 3
x = 3
[/STEPS]

So x = 3! Let's verify: 3(3 + 2) = 3(5) = 15 ✓
```

### Example 2: Color-Coded Manipulation
```
Starting with: 2x + [FOCUS:5] = 13

To isolate x, we need to get rid of the [FOCUS:5].
Subtract 5 from both sides:

2x + [OLD:5] = [OLD:13]
2x = [NEW:8]

Now divide by 2:
x = [NEW:4]
```

### Example 3: Graphing Functions
```
Let's visualize y = 2x + 3:

The slope is 2 (rise 2, run 1) and y-intercept is 3.

[DESMOS:y=2x+3]

See how the line crosses the y-axis at 3? That's the y-intercept!
```

---

## Tips for Maximum Impact

1. **Use STEPS for multi-step problems** - Makes abstract algebra concrete
2. **Combine highlights with steps** - Show what's changing in each step
3. **Graph whenever possible** - Visual learners need to SEE the function
4. **Keep explanations between steps brief** - Let the visual do the talking
5. **Use FOCUS to guide attention** - Show students where to look

---

## Technical Notes

- All syntax is stripped from the final display (students don't see `[STEPS]` tags)
- LaTeX rendering happens after visual processing
- Step containers have blue gradient background for consistency
