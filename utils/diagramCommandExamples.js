/**
 * DIAGRAM COMMAND EXAMPLES FOR AI
 * Teaches the AI how to use diagram commands effectively
 * Diagrams display inline in chat and can be clicked to enlarge
 */

const DIAGRAM_COMMAND_EXAMPLES = `
# VISUAL DIAGRAM SYSTEM

You can create accurate, mathematical diagrams to help visual learners. Use diagram commands when teaching concepts that benefit from visualization.

## AVAILABLE DIAGRAM TYPES

### 1. PARABOLA (Quadratic Functions)
**Format:** [DIAGRAM:parabola:a=value,h=value,k=value,showVertex=true,showAxis=true]

**Use for:**
- Graphing quadratic functions
- Finding vertex
- Understanding parabola shape

**Example:**
"Let's graph y = -2(x-3)² + 4. The parabola opens downward because a is negative."
[DIAGRAM:parabola:a=-2,h=3,k=4,showVertex=true,showAxis=true]

---

### 2. TRIANGLE (Geometry & Trigonometry)
**Format:** [DIAGRAM:triangle:a=value,b=value,c=value,showAngles=true]

**Use for:**
- Pythagorean theorem
- Right triangle problems
- Trigonometry (SOH-CAH-TOA)

**Example:**
"In this right triangle, we have legs of 3 and 4. Let's find the hypotenuse using Pythagorean theorem:"
[DIAGRAM:triangle:a=3,b=4,c=5,showAngles=true]

---

### 3. NUMBER LINE (Inequalities & Number Concepts)
**Format:**
- Simple: [DIAGRAM:number_line:min=-10,max=10]
- With inequality: [DIAGRAM:number_line:min=-10,max=10,inequality={value:3,type:'greater',inclusive:false}]

**Inequality types:**
- type: 'greater' for > or >=
- type: 'less' for < or <=
- inclusive: true for >= or <=, false for > or <

**Use for:**
- Graphing inequalities (x > 3, x ≤ -2)
- Understanding number placement
- Showing solutions on a number line

**Example:**
"Let's graph the solution x > 3:"
[DIAGRAM:number_line:min=-5,max=10,inequality={value:3,type:'greater',inclusive:false}]

**Example with <=:**
"For x ≤ -2:"
[DIAGRAM:number_line:min=-10,max=5,inequality={value:-2,type:'less',inclusive:true}]

---

### 4. COORDINATE PLANE (Linear Functions & Inequalities)
**Format:**
- Simple plane: [DIAGRAM:coordinate_plane:xRange=10,yRange=10,grid=true]
- With line: [DIAGRAM:coordinate_plane:xRange=10,yRange=10,lines=[{slope:2,yIntercept:1}]]
- With inequality: [DIAGRAM:coordinate_plane:xRange=10,yRange=10,inequality={slope:2,yIntercept:1,type:'greater',inclusive:false}]

**Inequality types:**
- type: 'greater' for y > mx + b
- type: 'less' for y < mx + b
- inclusive: true for solid line (≥, ≤), false for dashed line (>, <)

**Use for:**
- Graphing linear functions
- Plotting points
- Linear inequalities
- Understanding slope and y-intercept

**Example - Linear function:**
"Let's graph y = 2x + 1:"
[DIAGRAM:coordinate_plane:xRange=10,yRange=10,lines=[{slope:2,yIntercept:1,label:'y = 2x + 1'}]]

**Example - Linear inequality:**
"Let's graph y > 2x + 1 (the region ABOVE the line):"
[DIAGRAM:coordinate_plane:xRange=10,yRange=10,inequality={slope:2,yIntercept:1,type:'greater',inclusive:false}]

"For y ≤ -x + 3 (the region BELOW the line, including the line):"
[DIAGRAM:coordinate_plane:xRange=10,yRange=10,inequality={slope:-1,yIntercept:3,type:'less',inclusive:true}]

---

### 5. ANGLE (Angle Measurement)
**Format:** [DIAGRAM:angle:degrees=45,label='θ',showMeasure=true]

**Use for:**
- Understanding angles
- Degree measurement
- Angle relationships

**Example:**
"Here's a 45-degree angle:"
[DIAGRAM:angle:degrees=45,label='θ',showMeasure=true]

---

## WHEN TO USE DIAGRAMS

✅ **DO USE for:**
- Graphing functions (parabolas, lines)
- Geometry problems (triangles, angles)
- Inequalities (number lines, coordinate planes)
- Word problems needing visual context

❌ **DON'T USE for:**
- Simple arithmetic
- Purely algebraic manipulation
- Word-only explanations that don't benefit from visuals

---

## BEST PRACTICES

1. **Always explain before showing the diagram**
   - Set context first
   - Use the diagram to reinforce the explanation

2. **Keep parameters accurate**
   - Use exact values from the problem
   - Ensure coordinates/measurements are correct

3. **Use appropriate ranges**
   - For number lines: typically -10 to 10
   - For coordinate planes: adjust based on the problem (typically 5-15)

4. **Label clearly**
   - Use descriptive labels
   - Show what the diagram represents

---

## COMMON MISTAKES TO AVOID

❌ Using coordinate plane for number line problems
✅ Use number_line for 1-dimensional inequalities

❌ Forgetting to set inequality type and inclusive flags correctly
✅ type: 'greater' or 'less', inclusive: true or false

❌ Using diagrams for every problem
✅ Only use when visual understanding helps

---

## COMPLETE EXAMPLES

**Example 1: Quadratic Function**
Student: "How do I graph y = x² - 4?"
AI: "Let's graph this parabola! This is in the form y = a(x-h)² + k where a=1, h=0, and k=-4. The vertex is at (0, -4) and it opens upward because a is positive."
[DIAGRAM:parabola:a=1,h=0,k=-4,showVertex=true,showAxis=true]
"Notice how the parabola crosses the x-axis at x = -2 and x = 2. These are the solutions to x² - 4 = 0."

**Example 2: Inequality on Number Line**
Student: "How do I graph x ≥ 2?"
AI: "Great question! For x ≥ 2, we want all numbers that are greater than or equal to 2. The filled circle means we INCLUDE 2, and we shade to the right."
[DIAGRAM:number_line:min=-5,max=10,inequality={value:2,type:'greater',inclusive:true}]
"See how the circle is filled in at 2? That's because the inequality includes 2 (≥ means 'greater than or equal to')."

**Example 3: Linear Inequality**
Student: "How do I graph y < 2x + 3?"
AI: "Let's graph this linear inequality! First, we graph the boundary line y = 2x + 3 (with slope 2 and y-intercept 3). Since it's '<' (not '≤'), we use a dashed line. Then we shade BELOW the line because y is LESS THAN 2x + 3."
[DIAGRAM:coordinate_plane:xRange=10,yRange=10,inequality={slope:2,yIntercept:3,type:'less',inclusive:false}]
"The dashed line shows that points ON the line are NOT included in the solution. Only points in the shaded region satisfy y < 2x + 3."

**Example 4: Pythagorean Theorem**
Student: "A tree casts a 12-foot shadow. If the tree is 9 feet tall, how far is the top of the tree from the end of the shadow?"
AI: "Perfect problem for the Pythagorean theorem! Let's visualize this as a right triangle. The tree is one leg (9 ft), the shadow is the other leg (12 ft), and we need to find the hypotenuse (distance from treetop to shadow end)."
[DIAGRAM:triangle:a=9,b=12,c=15,showAngles=true]
"Using a² + b² = c²:
9² + 12² = c²
81 + 144 = c²
225 = c²
c = 15 feet"
`;

module.exports = {
    DIAGRAM_COMMAND_EXAMPLES
};
