# Mathmatix Live Workspace — Product Requirements Sheet

> **Document status:** Final product direction (baseline product specification)
> **Product:** Mathmatix.ai · **Feature:** Live Workspace
> **Primary audience:** Students learning mathematics
> **Secondary audiences:** Tutors, teachers, parents, and school administrators
>
> Related docs: `WHITEBOARD_AI_INTEGRATION.md`, `BOARD_LLM_STAGE_DESIGN.md`,
> `CHAT_BOARD_AI_INTEGRATION.md`, `DUAL_MODE_SYSTEM_DESIGN.md`.

---

## 1. Product Vision

The Mathmatix Live Workspace is a shared, interactive, math-aware environment where students
work through mathematics alongside an AI tutor.

It must **not** function as a chatbot beside a generic whiteboard.

The workspace must understand:

* What problem the student is solving
* What each mathematical object represents
* What the student has entered or manipulated
* What changed from one step to the next
* Whether the move is mathematically valid
* What assistance the tutor provided
* What the student's work demonstrates
* Which ideas, realizations, and mistakes are worth preserving

The workspace is the central Mathmatix product experience. Voice, chat, OCR, tutoring, graphing,
gamification, mastery tracking, and teacher reporting must all connect through the workspace.

## 2. Core Product Principle

A student takes a mathematical action. Mathmatix understands the action, responds instructionally,
updates the shared visual workspace, and records what the action provides evidence of.

**Student work must remain the primary source of truth.**

The tutor may:

* Ask questions
* Point
* Highlight
* Annotate
* Introduce a visual
* Provide a scaffold
* Show a parallel example
* Model a limited step when instructionally necessary

The tutor must not silently complete the student's problem.

## 3. Workspace Object Model

The Live Workspace is a spatial board composed of meaningful objects.

The required primary object types are:

1. Problem Cards
2. Source Cards
3. Idea Cards
4. AHA Cards
5. Reminder Cards
6. Strategy Cards
7. Reflection Cards
8. Reference Cards
9. Interactive Objects

All objects must be:

* Movable
* Resizable when appropriate
* Selectable
* Collapsible when appropriate
* Linkable to related objects
* Searchable after the session
* Accessible through keyboard and screen-reader controls

## 4. Problem Card Requirements

### 4.1 One problem, one card

Every new mathematical problem must create exactly one Problem Card. All work related to that
problem must remain inside the same Problem Card.

A new card must **not** be created for:

* Each solution step
* Each tutor question
* Each student reply
* Each correction
* Each hint
* Each visual representation
* Each graph adjustment
* Each voice exchange

The Problem Card represents the complete mathematical episode.

### 4.2 Problem Card contents

A Problem Card may contain:

* Original problem
* Source information
* Directions
* Student's initial attempt
* Successive solution steps
* Revised steps
* Tutor annotations
* Tutor prompts
* Embedded interactives
* Visual representations
* Checks
* Student explanation
* Final response
* Confidence rating
* Skill evidence
* Scaffold history

Sections should appear only when needed. Potential internal sections include:

* Problem
* Understand
* Plan
* Work
* Visual
* Check
* Explain
* Reflect
* Evidence

The interface must not display empty sections unnecessarily.

### 4.3 Expanding solution steps

New solution steps must expand vertically within the Problem Card.

Each step must record:

* Mathematical content
* Step number or sequence position
* Creator: student, tutor, or system
* Time created
* Previous state
* Resulting state
* Validation status
* Related tutor assistance
* Revision history

Incorrect work should not automatically disappear. The student must be able to:

* Revise a step
* Undo a move
* Restore an earlier attempt
* Compare before and after
* Explain why a change was made

### 4.4 Problem Card states

A Problem Card may have the following states:

* New
* Interpreting
* Planning
* Working
* Checking
* Explaining
* Complete
* Needs Review
* Paused
* Reopened

The current state should influence the interface subtly without making the workspace resemble
project-management software.

### 4.5 Completed Problem Cards

When complete, a Problem Card should collapse into a concise summary displaying:

* Problem identifier
* Original problem or abbreviated version
* Final result
* Completion status
* Key learning
* Skills demonstrated
* Assistance level
* Review status

Students must be able to reopen the full work.

### 4.6 Multi-part problems

Multi-part questions should normally remain one Problem Card with expandable subparts.

Example:

* Part A: Write an equation
* Part B: Graph the equation
* Part C: Interpret the intercept

Shared directions, diagrams, and context must remain visible at the card level. Separate Problem
Cards should be created only when the parts function as independent problems.

## 5. Uploaded Files and Source Cards

### 5.1 Files must appear on the board

Uploaded materials must appear directly on the workspace board. They must **not** disappear into:

* An attachment menu
* A hidden upload drawer
* A separate browser tab
* A disconnected file viewer

Supported source types should include:

* PDF
* Photograph
* Screenshot
* Worksheet image
* Text document
* Teacher assignment
* Scanned handwritten work

### 5.2 Source Card capabilities

A Source Card must support:

* Move · Resize · Zoom · Pan · Rotate
* Change pages · Display page thumbnails
* Highlight · Circle · Annotate · Crop
* Select a problem region
* Pin directions
* Hide or show annotations
* Collapse · Return to full document
* Open beside active student work

Students must be able to write or annotate over the displayed source where appropriate.

### 5.3 Problem extraction

Mathmatix should detect potential problem regions inside an uploaded source. The system may identify:

* Problem numbers
* Directions
* Equations
* Graphs
* Tables
* Diagrams
* Multi-part questions
* Existing handwritten work

Detected problems must **not** all automatically populate the board. The student or tutor should
select which problem becomes active. Selecting a problem region creates one linked Problem Card.

### 5.4 Source linking

Every extracted Problem Card must retain a relationship to its source. Required source metadata:

* File name
* Page number
* Original coordinates or cropped region
* Problem number
* Shared directions
* Related graph, table, or diagram
* Assignment identifier when available

Selecting the source reference from the Problem Card must return attention to the correct location
in the source. Selecting the original region in the source must highlight or open the related
Problem Card.

### 5.5 Shared-source problems

When several problems rely on one graph, table, diagram, or passage:

* The shared material should remain one Source or Reference Card.
* Each question should receive its own Problem Card.
* All Problem Cards should remain linked to the shared source.
* The shared source should not be duplicated unnecessarily.

## 6. Interactive Mathematics Requirements

### 6.1 Interactives are mandatory

Interactive mathematical tools are a core requirement. They must **not** be:

* Optional decorative animations
* Static images
* External links
* Separate disconnected calculators
* Tools that open outside the current learning context

Interactives must appear directly on the board or inside the active Problem Card.

### 6.2 Interactive display states

Interactive objects must support three primary display states.

**Embedded** — the interactive appears within the Problem Card. Appropriate for: number lines,
small coordinate graphs, algebra tiles, balance models, fraction models, ratio tables, quick checks.

**Expanded** — the interactive enlarges into the main workspace while remaining linked to the
Problem Card. Appropriate for: detailed graphing, geometry constructions, complex diagrams,
statistical exploration, multiple linked representations.

**Pinned** — the interactive remains visible on the board as a reusable reference. Appropriate
for: shared graphs, common data sets, formula explorers, geometry diagrams, teacher demonstrations,
models used across several problems.

When an expanded interactive closes, its important state or result must return to the Problem Card.

### 6.3 Required Algebra interactives

* Balance scale
* Algebra tiles
* Like-term grouping
* Distribution model
* Equation transformation controls
* Inequality number line
* Function machine
* Factoring area model
* Systems intersection explorer
* Expression tree
* Completing-the-square model
* Equivalent-expression comparison

### 6.4 Required number and proportional-reasoning interactives

* Number line
* Integer chips
* Fraction bars
* Fraction circles
* Area models
* Percent grids
* Ratio tables
* Double number lines
* Place-value models
* Unit-conversion chains
* Prime factorization models

### 6.5 Required graphing and function interactives

* Coordinate plane
* Movable points
* Draggable lines and curves
* Parameter sliders
* Linked graph and table
* Slope triangles
* Intercept controls
* Domain and range controls
* Function transformations
* Multiple-function comparison
* Regression and line-of-fit tools
* Graph tracing
* Function-composition machines

### 6.6 Required geometry interactives

* Draggable geometric figures
* Compass and straightedge constructions
* Angle relationship explorer
* Transformations
* Coordinate transformations
* Congruence and similarity tools
* Measurement overlays
* Three-dimensional nets
* Cross sections
* Coordinate-proof tools
* Scale-factor models

### 6.7 Required statistics and probability interactives

* Movable data points
* Dot plots
* Histograms
* Box plots
* Scatterplots
* Lines of fit
* Residual plots
* Two-way tables
* Probability simulations
* Sampling simulations
* Measures-of-center comparisons

### 6.8 Linked representations

Interactives should connect representations whenever mathematically appropriate. Examples:

* Change an equation and update its graph.
* Drag a point and update its coordinates and table row.
* Modify a table and update the graph.
* Rearrange algebra tiles and update the symbolic expression.
* Move a slider and update the graph, equation, and explanation.
* Change a geometric figure and update relevant measurements.

Representations must not function as isolated tools.

### 6.9 Interactives as evidence

Every meaningful action inside an interactive must be interpreted mathematically. The system must
distinguish between:

* Mathematically meaningful actions
* Interface navigation
* Random dragging
* Guessing
* Valid exploration
* Correct construction
* Correct result reached through invalid reasoning

Interactive actions may produce mastery evidence only when the mathematical meaning has been verified.

## 7. Important Learning Cards

Important learning must not remain buried inside long Problem Cards. Content may be promoted into
a separate card when it becomes reusable, meaningful, or personally important.

### 7.1 Idea Cards

Idea Cards preserve general mathematical concepts. Examples:

* Whatever operation is performed on one side of an equation must also be performed on the other.
* Parallel lines have equal slopes.
* Factors may cancel, but terms separated by addition cannot.
* The solution of a system must satisfy both equations.

Idea Cards should be: concise, visual when useful, searchable, linked to source problems, reusable
in later sessions, and written at the student's reading level.

### 7.2 AHA Cards

AHA Cards preserve a student's conceptual realization. They should prioritize the student's own
wording.

Example: *"The five did not jump across the equation. I subtracted five from both sides."*

An AHA Card may include:

* Student quotation
* Formal mathematical connection
* Related skill
* Original Problem Card
* Date created
* Option to use during future review

Mathmatix may detect a potential AHA moment when:

* The student says they understand
* The student corrects a prior misconception
* The student explains a new connection
* The student generalizes a pattern
* The student applies the realization successfully

When confidence is low, Mathmatix should ask the student before saving it.

### 7.3 Reminder Cards

Reminder Cards preserve recurring mistakes or personal cautions. Student-facing labels may include:

* Watch for This
* My Reminder
* Check This Next Time
* Almost Had It
* Common Trap

A Reminder Card may include:

* The student's incorrect example
* Corrected example
* Explanation of the difference
* Student-created checking strategy
* Related skills
* Link to the original problem

Reminder Cards must feel supportive rather than punitive.

### 7.4 Strategy Cards

Strategy Cards preserve reusable processes or decision rules. Examples:

* Draw distribution arrows to every term.
* Check whether factoring will make the equation easier.
* Estimate before calculating.
* Identify the units before creating an equation.
* Compare the last correct step with the first incorrect step.

### 7.5 Reflection Cards

Reflection Cards preserve student thinking after a lesson or session. Possible prompts:

* What finally made sense?
* What should you check next time?
* What can you now do independently?
* What still feels uncertain?
* Which representation helped most?

### 7.6 Card promotion

Important content may begin inside a Problem Card and later be promoted. Promotion workflow:

1. Student encounters or states an important idea.
2. Mathmatix identifies the potential value.
3. The tutor confirms or suggests saving it.
4. The content becomes a separate linked card.
5. The original content remains inside the Problem Card.
6. The promoted card becomes available during future review.

This promotion process prevents unnecessary board clutter.

## 8. Tutor Interaction Requirements

The tutor must appear to share the workspace with the student. The tutor must be able to:

* Point to an exact term, step, point, region, or object
* Highlight a mathematical element
* Circle a region
* Dim irrelevant information
* Zoom into part of the source or work
* Place representations side by side
* Add a compact prompt near the relevant work
* Open or close an interactive
* Introduce a parallel problem
* Replay a transformation
* Compare two strategies
* Restore an earlier attempt
* Ask the student to manipulate an object
* Pause and wait for student action
* Promote an important idea into a card
* Collapse completed work
* Save important work to the notebook

Tutor speech, captions, pointing, and highlighting must be synchronized. When the tutor refers to
a specific mathematical object, that object must become visually identifiable.

## 9. Tutor Prompt Display

Tutor messages should not automatically create board cards. Tutor guidance should generally appear as:

* Anchored annotations
* Speech bubbles
* Brief captions
* Highlighted prompts
* Temporary overlays
* Questions attached to a step
* Tutor gestures

Longer instruction may appear in an expandable teaching panel or Idea Card when the content
deserves to persist.

**Chat must function as connective tissue, not the primary product surface.**

## 10. Mathematical Action and Validation System

Every meaningful student action must create a structured event. A **StudentMove** event should include:

* Session identifier
* Student identifier
* Problem identifier
* Workspace state
* Object acted upon
* Action type
* Before state
* After state
* Student explanation when available
* Time elapsed
* Tutor assistance level
* Mathematical validity
* Mathematical interpretation
* Skills implicated
* Evidence strength
* Confidence in interpretation

Possible mathematical actions include:

Enter · Select · Drag · Group · Ungroup · Apply · Substitute · Simplify · Distribute · Factor ·
Plot · Connect · Label · Compare · Sort · Estimate · Explain · Verify · Revise · Undo · Request help

Mathematical validity must be verified by a deterministic or server-side mathematics engine when
possible. **The language model must not be the sole authority for whether a move is valid.**

## 11. Misconception Detection

Mathmatix should diagnose likely reasoning patterns, not merely mark answers wrong. Supported
misconception detection should include:

* Combining unlike terms
* Partial distribution
* Losing a negative sign
* Confusing subtraction with a negative coefficient
* Performing an operation on only one side
* Incorrectly reversing an inequality
* Treating an exponent as multiplication
* Adding denominators
* Canceling across addition
* Reversing rise and run
* Misreading graph scale
* Switching coordinate order
* Confusing slope and intercept
* Applying additive reasoning to multiplicative relationships
* Using a memorized procedure in the wrong structure

The tutor should select an instructional response based on the suspected cause. Possible responses:

* Ask the student to inspect a step
* Compare two states
* Use a counterexample
* Simplify the numbers
* Introduce a visual model
* Review a prerequisite
* Ask the student to explain
* Offer possible interpretations
* Generate a parallel problem
* Provide explicit instruction

## 12. Scaffold and Independence Tracking

Mathmatix must record how much support was required. Assistance levels:

1. Independent
2. Encouragement only
3. Directions restated
4. Attention cue
5. Strategic question
6. Visual scaffold
7. Partial setup
8. Parallel example
9. Explicit instruction
10. Tutor-modeled step
11. Tutor-completed solution

A correct result reached independently must generate stronger evidence than the same result reached
after heavy tutoring. The system should intentionally fade support over time. Recommended progression:

1. Model
2. Complete together
3. Guide with questions
4. Prompt lightly
5. Observe independently
6. Verify transfer later

## 13. Skill Evidence and Mastery

The workspace must feed Mathmatix's component-composite skill graph. Evidence should account for:

* Correctness
* Independence
* Problem complexity
* Novelty
* Representation used
* Student explanation
* Error detection
* Self-correction
* Transfer
* Retention
* Time since previous evidence
* Consistency
* Scaffold level
* Guessing likelihood

Mathmatix should only infer skills directly supported by the student's evidence.

Example: successfully solving a two-step equation may provide evidence for:

* Understanding equality
* Selecting inverse operations
* Solving one-step equations
* Signed-number arithmetic
* Maintaining equivalence
* Verifying a solution

It must **not** automatically prove:

* One-step inequalities
* Systems of equations
* Every equation form
* General mastery of all algebraic reasoning

Mastery stages may include:

* First Exposure
* Emerging
* Developing
* Nearly Secure
* Demonstrated
* Retained
* Transfer-Ready
* Needs Review

Mastery should require repeated, varied, independent evidence over time.

## 14. Session Board Organization

The board should remain spatial without becoming chaotic.

**Active area** — may contain: current Problem Card, relevant Source Card, active interactive,
one or two supporting cards.

**Supporting area** — may contain: pinned Idea Cards, AHA Cards, Reference Cards, relevant prior work.

**Completed area** — contains collapsed completed Problem Cards.

The system may assist with layout but must not constantly move objects against the student's
expectations.

Required board actions: Focus · Move · Resize · Pin · Collapse · Expand · Group · Stack · Link ·
Move aside · Return to source · Save to notebook · Remove from current board · Reopen

## 15. Persistent Learning Notebook

The active workspace may be temporary, but important learning must persist. Each completed session
should save:

* Source material
* Problem Cards
* Important student attempts
* Successful strategy
* Misconceptions
* AHA Cards
* Idea Cards
* Reminder Cards
* Student explanations
* Verification
* Assistance level
* Skill evidence
* Suggested next steps

Students should be able to search their notebook using natural language. Examples:

* Show me where I learned slope.
* Find a problem where I lost a negative sign.
* Show equations I solved independently.
* What did I learn about fractions?
* What should I review before my test?
* Show my AHA moments from this unit.

Teachers should be able to search across student evidence when permitted.

## 16. Input Modes

The workspace must support:

* Standard text
* Mathematical keyboard
* Handwriting
* Voice
* Camera
* Screenshot
* PDF upload
* File upload
* Teacher-assigned problems
* Imported assignment content

OCR must preserve: fractions, radicals, exponents, subscripts, grouping symbols, inequality
symbols, graph labels, tables, and existing student work.

Uncertain OCR must be visibly flagged for confirmation.

## 17. Desktop and Mobile Layouts

### 17.1 Desktop text mode

* Workspace occupies most of the screen.
* Mathematical input is prominent.
* Tutor remains visible but secondary.
* Transcript is accessible but not dominant.
* Objects can be manipulated precisely.

### 17.2 Desktop voice mode

* Workspace remains central.
* Tutor gesture and captions are synchronized.
* Transcript becomes a supporting panel.
* Hands-free workspace commands are available.

### 17.3 Mobile voice mode

* Camera and physical student work are primary.
* Tutor appears vertically when appropriate.
* Captions are brief.
* Controls are large and minimal.
* The student can direct attention to specific handwritten steps.
* Updated work can be recaptured without restarting the problem.

### 17.4 Mobile text mode

* Conversation is compact.
* Workspace can expand to full screen.
* Math keyboard is available.
* Show My Work is prominent.
* Students can switch easily between source, workspace, and tutor.

## 18. Accessibility Requirements

Accessibility must be part of the core workspace architecture. Required support:

* Keyboard navigation
* Screen-reader labels
* Spoken mathematics
* Audio graph exploration
* Adjustable reading level
* Adjustable voice speed
* Captions
* High contrast
* Reduced visual density
* Reduced motion
* Chunked directions
* Read-aloud directions
* Repeat and rephrase controls
* One-step-at-a-time presentation
* Focus mode
* Working-memory supports
* Vocabulary previews
* Translation support
* Teacher-selected accommodations
* IEP and 504-aware tutoring behavior

Accommodations should modify access and delivery without silently reducing the mathematical target.

## 19. Gamification Requirements

Gamification must reward productive mathematical behavior rather than message volume. Rewardable
actions include:

* Making a valid attempt
* Revising an error
* Explaining reasoning
* Solving independently
* Using a new representation
* Demonstrating retention
* Showing transfer
* Identifying a misconception
* Persisting through difficulty
* Reaching a skill milestone

Possible visual feedback: equation balance animation, terms locking into place, graph updates,
like terms merging, tutor reaction, XP movement, skill progress update, AHA celebration, level-up
animation, token reward.

Rewards must follow demonstrated thinking. Academic capabilities must not be locked behind
cosmetic rewards.

## 20. Teacher Requirements

Teachers should be able to **see**:

* Student's active problem
* Current skill
* Workspace status
* Time actively engaged
* Current scaffold level
* Recent misconception
* Evidence earned
* Students who appear stuck
* Students needing human intervention
* Common class errors
* Readiness for upcoming content

Teachers should be able to **do**:

* Push a problem into a workspace
* Assign source files
* Require an explanation
* Restrict available tools
* Set calculator permissions
* Select preferred methods
* Add vocabulary
* Set accommodations
* Review completed Problem Cards
* Review AHA and Reminder Cards
* Comment on work
* Assign targeted follow-up
* Confirm or override mastery
* Inspect evidence behind mastery estimates

## 21. Parent Requirements

Parent reports should summarize:

* What the student worked on
* What improved
* Skills becoming secure
* Where support was required
* Whether the student persisted
* Important AHA moments
* Recurring reminders
* Recommended next practice

Parents should not receive raw tutoring transcripts as the primary report.

## 22. Required Use Cases

The system must support at minimum:

1. Photographing a handwritten problem and existing work.
2. Uploading a PDF that appears directly on the board.
3. Selecting one problem from a multi-problem worksheet.
4. Creating one Problem Card linked to the selected source region.
5. Expanding all solution steps inside the same Problem Card.
6. Revising an incorrect step without deleting its history.
7. Pointing to a specific mathematical term during voice tutoring.
8. Opening an interactive model inside a Problem Card.
9. Expanding the interactive into the main workspace.
10. Returning interactive results to the Problem Card.
11. Linking graphs, equations, and tables.
12. Detecting a likely misconception.
13. Selecting an appropriate instructional response.
14. Generating a parallel problem rather than solving the original.
15. Verifying a student move mathematically.
16. Recording the assistance level.
17. Capturing a student explanation.
18. Promoting an important idea into an Idea Card.
19. Saving a student realization as an AHA Card.
20. Saving a recurring error as a Reminder Card.
21. Collapsing a completed Problem Card.
22. Reopening completed work.
23. Searching prior work by skill or misconception.
24. Assigning skill evidence from verified student actions.
25. Providing teacher and parent summaries.

## 23. Non-Goals

The Live Workspace should **not** become:

* A generic infinite whiteboard
* A traditional learning-management system
* A transcript-first chatbot
* An automatic answer generator
* A collection of disconnected calculators
* A worksheet completion engine
* A static digital notebook
* A canvas that treats every mark as evidence
* A system that declares mastery from one correct answer
* A platform that rewards message volume
* A complicated design tool students must learn before doing mathematics

## 24. MVP Requirements

The first production-ready version must include:

1. Spatial workspace board
2. One-problem-per-card architecture
3. Expandable steps within Problem Cards
4. Completed-card collapse and reopen
5. PDF and image Source Cards on the board
6. Problem-region selection
7. Source-to-Problem-Card linking
8. Structured equation input
9. Step validation
10. StudentMove event model
11. Tutor pointing and highlighting
12. Anchored tutor prompts
13. Basic embedded interactives
14. Graph, table, and equation linking
15. Idea Card creation
16. AHA Card creation
17. Reminder Card creation
18. Scaffold-level tracking
19. Skill-evidence emission
20. Session persistence
21. Mobile Show My Work flow
22. Keyboard and screen-reader support

## 25. Initial Algebra 1 Interactive Set

The first subject implementation should prioritize:

* Equation transformation
* Balance model
* Number line
* Integer model
* Algebra tiles
* Distribution model
* Like-term grouping
* Inequality graphing
* Coordinate graph
* Linked table and graph
* Slope triangle
* Function comparison
* Systems intersection
* Factoring area model
* Exponent visualization

These tools should support the existing Mathmatix instructional language and methods.

## 26. Acceptance Criteria

The Live Workspace is successful when:

* A student can upload a worksheet and see it on the board.
* A student can select one problem and receive one linked Problem Card.
* Every step remains within that Problem Card.
* The tutor can refer visually to an exact part of the student's work.
* Student work remains distinguishable from tutor support.
* At least one interactive can be embedded, expanded, and pinned.
* Interactive actions are interpreted mathematically.
* Invalid mathematical changes are detected.
* Student revisions remain visible.
* Important ideas can become separate cards.
* AHA moments preserve student language.
* Completed problems collapse without losing work.
* Session artifacts persist into a searchable notebook.
* Skill evidence records correctness and assistance level.
* The system does not grant unsupported mastery.
* The mobile experience supports paper-based student work.
* The experience remains usable without relying on a chat transcript.

## 27. Final Product Definition

The Mathmatix Live Workspace is a shared mathematical environment built around a simple structure:

* Files and resources live on the board.
* Every new problem receives one Problem Card.
* All steps expand inside that card.
* Interactives are native and mathematically meaningful.
* Important ideas and AHA moments earn their own cards.
* Student actions become verified learning evidence.
* Completed work becomes a persistent learning history.

The workspace should allow a student, tutor, teacher, or parent to look at the final board and
understand not only what was completed, but how the student's thinking changed.

This version is the baseline product specification.
