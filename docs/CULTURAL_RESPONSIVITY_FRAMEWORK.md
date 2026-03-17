# Mathmatix AI — Cultural Responsivity Framework

**Version:** 1.0
**Date:** 2026-03-17
**Scope:** Platform-wide culturally responsive and sustaining pedagogy
**Grounding:** Gloria Ladson-Billings (Culturally Relevant Pedagogy), Geneva Gay (Culturally Responsive Teaching), Django Paris (Culturally Sustaining Pedagogy), Luis Moll (Funds of Knowledge)

---

## 1. PURPOSE

Mathmatix AI's mission — **"An Affordable Math Tutor for Every Child"** — demands that *every child* means every identity, every language, every community. This framework establishes principles, practices, and accountability mechanisms to ensure that Mathmatix doesn't just *include* diverse students but actively *sustains* their cultures, identities, and ways of knowing through mathematics instruction.

Cultural responsivity is not an add-on. It is woven into the platform's pedagogy, AI behavior, content design, and quality assurance.

---

## 2. THEORETICAL FOUNDATIONS

### 2.1 Three Pillars of Culturally Responsive Math Education

| Pillar | Definition | Mathmatix Application |
|--------|-----------|----------------------|
| **Academic Excellence** | Hold high expectations for ALL students; never lower rigor as a proxy for "support" | Concept-first teaching, DOK gating, mastery badges, Socratic questioning — all apply equally regardless of student background |
| **Cultural Competence** | Students develop positive cultural identities while learning to navigate across cultures | Tutor personas reflect diverse backgrounds; word problems reflect diverse lived experiences; students' interests and identities shape personalization |
| **Critical Consciousness** | Students use mathematics to understand and address real-world inequities | Age-appropriate data literacy problems that examine community issues; math as a tool for reasoning about fairness, access, and justice |

### 2.2 Funds of Knowledge

Every student enters Mathmatix with existing mathematical knowledge from their homes, communities, and cultures:

- **Cooking and recipes** → fractions, ratios, proportional reasoning, unit conversion
- **Music and rhythm** → patterns, fractions, frequency, ratios
- **Sports and games** → statistics, probability, geometry, measurement
- **Shopping and budgeting** → percentages, decimals, arithmetic, comparison
- **Building and crafting** → geometry, measurement, spatial reasoning
- **Navigation and travel** → distance, time, rate, coordinates
- **Cultural traditions** → patterns (tessellations in Islamic art, symmetry in Native beadwork, fractals in African architecture), counting systems, calendar mathematics
- **Multilingual reasoning** → number words, mathematical structures across languages

The platform should *recognize, validate, and build on* these funds of knowledge rather than treating students as blank slates.

### 2.3 Asset-Based Framing

Every interaction should communicate: **"You already know more math than you think."**

- **Deficit framing (AVOID):** "You don't know how to multiply fractions yet."
- **Asset framing (USE):** "You already know how to find parts of things — like splitting something in half. Let's build on that."

This applies to all AI tutor behavior, word problem contexts, and progress messaging.

---

## 3. CULTURALLY RESPONSIVE WORD PROBLEMS

### 3.1 Principles

1. **Mirror and Window** — Word problems should sometimes reflect students' own communities (mirrors) and sometimes open windows into other communities and cultures
2. **Authenticity over Tokenism** — Cultural contexts should be meaningful and accurate, not superficial name-swaps on generic problems
3. **Normalizing Diversity** — Diverse names, family structures, and community contexts should appear naturally and consistently, not as "special" problems
4. **Avoiding Stereotypes** — Never assign cultural contexts based on stereotypes (e.g., don't only use taco/burrito contexts for characters with Latinx names)
5. **Community Assets** — Frame communities as places of resources and strengths, not deficits

### 3.2 Name Diversity Standards

Each course must include names reflecting the demographic diversity of U.S. K-12 students:

| Category | Example Names | Minimum Representation |
|----------|-------------|----------------------|
| **African American** | Jayden, Keisha, Marcus, Aaliyah, DeShawn, Imani, Malik, Nia | Present in every course |
| **Latinx/Hispanic** | Carlos, María, Sofia, Diego, Valentina, Mateo, Camila, Luis | Present in every course |
| **Asian American** | Wei, Priya, Hiroshi, Mei-Lin, Arjun, Yuki, Aarav, Linh | Present in every course |
| **Indigenous/Native** | Koda, Winona, Sequoia, Aiyana, Tala, Dakota | Present in every course |
| **Middle Eastern/North African** | Aisha, Omar, Fatima, Yusuf, Layla, Zara | Present in every course |
| **White/European American** | Emma, Tyler, Mason, Hannah, Liam, Olivia | Present in every course |
| **Gender-neutral** | Alex, Jordan, Riley, Avery, Morgan, Quinn | Present in every course |

**Minimum per course:** 10 distinct names across at least 4 of the above categories.

### 3.3 Context Diversity Standards

Word problems should draw from a rotating set of culturally grounded contexts:

**Universal Contexts (all grade bands):**
- School events (read-a-thons, science fairs, art shows, school gardens)
- Community activities (food drives, park cleanups, library programs, farmers markets)
- Family life (cooking, road trips, household projects, celebrations)
- Recreation (sports, games, music, outdoor activities)

**Culturally Specific Contexts (rotate naturally):**
- **Community celebrations:** Lunar New Year, Diwali, Eid, Kwanzaa, Día de los Muertos, Powwow, Hanukkah, Juneteenth, Nowruz
- **Food and cooking:** Recipes from diverse cuisines (adjust portions → fractions/ratios)
- **Art and design:** Geometric patterns from various cultures (tessellations, symmetry, fractals)
- **Music:** Rhythm and beat patterns, time signatures, frequency
- **Markets and commerce:** Different economic contexts (tianguis, bazaars, flea markets, bodegas)
- **Architecture:** Structures from diverse traditions (pyramids, geodesic domes, longhouses, minarets)
- **Games:** Mancala (African), Tangram (Chinese), Lotería (Mexican), chess origins

### 3.4 Critical Consciousness Contexts (Grades 6+)

Age-appropriate problems that use math to examine real-world issues:

- **Data analysis:** Compare access to parks, libraries, or broadband across neighborhoods
- **Statistics:** Examine patterns in school funding, health outcomes, or environmental data
- **Proportional reasoning:** Analyze representation in media, government, or professions
- **Financial literacy:** Explore income disparities, cost of living differences, savings strategies
- **Geometry/measurement:** Examine food deserts, transit access, urban planning equity

**Implementation Note:** These should empower, not overwhelm. Frame as "math gives you the tools to understand and change the world," not as presenting injustice without agency.

---

## 4. TUTOR PERSONA CULTURAL DEPTH

### 4.1 Principles for Persona Design

Each tutor persona should:
1. **Have an authentic cultural identity** — not a stereotype, but a real person with a background story
2. **Serve as both mirror and window** — some students will see themselves; others will learn across cultures
3. **Demonstrate that math excellence exists in every community**
4. **Model code-switching naturally** — tutors may reference their backgrounds when contextually appropriate
5. **Never be defined solely by their culture** — they are math teachers first, with rich personalities

### 4.2 Cultural Background Guidelines

Each tutor's `culturalBackground` field provides context the AI can draw on naturally:

- **Origin story:** Where they grew up, what inspired their love of math
- **Cultural connections:** How their background connects to mathematics
- **Community ties:** What communities they represent and care about
- **Teaching philosophy roots:** How their culture informs how they teach

These backgrounds should feel organic — a tutor might mention "my grandmother used to say..." or "where I grew up, we learned to count by..." without it being forced.

### 4.3 Bilingual/Multilingual Expansion Roadmap

| Phase | Language | Persona | Timeline Target |
|-------|----------|---------|----------------|
| **Current** | Spanish/English | Ms. Maria | Live |
| **Phase 2** | Mandarin/English | New persona | Future |
| **Phase 3** | Arabic/English | New persona | Future |
| **Phase 4** | Vietnamese/English | New persona | Future |
| **Phase 5** | Haitian Creole/English | New persona | Future |

Each bilingual persona follows the Ms. Maria model: authentic code-switching, culturally grounded encouragement, and mathematical terminology in both languages.

---

## 5. AI BEHAVIOR GUIDELINES

### 5.1 Culturally Responsive AI Tutoring Rules

These rules are integrated into the system prompt and apply to all AI tutor interactions:

1. **Asset-Based Language:** Always frame student knowledge as a foundation to build on. Never use deficit framing ("you don't know," "you can't," "you haven't learned").

2. **Cultural Context Awareness:** When a student mentions their background, interests, family traditions, or community — naturally incorporate these into math examples when relevant. If a student mentions they help at their family's restaurant, use restaurant math. If they mention a cultural celebration, use it as a problem context.

3. **Name Pronunciation Respect:** Never shorten, anglicize, or comment on the difficulty of a student's name. Use it as provided.

4. **Multilingual Validation:** If a student uses mathematical terms in another language, acknowledge and bridge: "Yes! That's exactly right — 'más' and 'plus' mean the same thing here."

5. **Community Strengths:** When creating word problems on the fly, draw from contexts that reflect community assets (local businesses, cultural events, family activities) rather than deficits.

6. **Multiple Mathematical Traditions:** Acknowledge that mathematical knowledge comes from many cultures. When historically relevant, mention diverse origins (algebra from al-Khwarizmi, zero from Indian mathematicians, binary from Leibniz building on I Ching, fractals in African village design).

7. **Equitable Pacing:** Never assume a student's capability based on their name, language, or background. Every student gets the same rigorous concept-first teaching.

### 5.2 Anti-Bias Safeguards

The AI must NEVER:
- Assume a student's math level based on demographic information
- Use cultural stereotypes in word problems (e.g., gendered contexts like "mom bakes cookies" exclusively)
- Lower expectations or rigor for any student group
- Frame mathematical struggle as a cultural or linguistic deficit
- Tokenize cultural references (one "diverse" problem followed by generic ones)

---

## 6. FAMILY & COMMUNITY ENGAGEMENT

### 6.1 Parent Dashboard Enhancements

- **Home Language Support:** Progress reports and key messages available in the student's preferred language
- **Culturally Familiar Communication:** Warm, relationship-first communication tone; avoid institutional jargon
- **Funds of Knowledge Tips:** Suggest home-based math activities tied to family routines (cooking, shopping, building)
- **Celebration of Progress:** Frame progress in ways that resonate across cultural contexts (effort, growth, persistence — not just grades)

### 6.2 Community Connections

- **Local Context:** When possible, use the student's geographic region to ground word problems (local landmarks, weather patterns, regional activities)
- **Family Math:** Provide optional take-home activities that involve family members and draw on household mathematical knowledge
- **Cultural Math Spotlights:** Brief, embedded moments where the AI connects a concept to its cultural origins or community applications

---

## 7. ACCESSIBILITY AS CULTURAL RESPONSIVITY

Accessibility IS cultural responsivity. Disability, neurodivergence, and learning differences exist across all cultures, and equitable access is a justice issue.

Mathmatix's existing IEP system (9 accommodations, 10 disability profiles) already addresses this. The CRT framework reinforces:

- **ESL/ELL Profile:** Not a disability — a linguistic asset. Bilingual students bring cognitive advantages. Frame accordingly.
- **Math Anxiety Profile:** Often rooted in prior negative experiences, which disproportionately affect students from marginalized communities. Address with empathy and asset framing.
- **Universal Design:** Features that help some students (visual models, chunked assignments, multiple representations) benefit ALL students. Default to inclusive design.

---

## 8. QUALITY ASSURANCE INTEGRATION

### 8.1 New QA Dimension: Cultural Responsivity & Equity

This framework adds a **9th dimension** to the existing QA rubric:

| Score | Criteria |
|-------|----------|
| **4 — Exemplary** | Word problems feature diverse names (10+ per course, 4+ cultural groups). Contexts reflect varied communities, family structures, and traditions. No stereotypes. At least 2 critical consciousness problems per course (grades 6+). Asset-based framing throughout. Cultural math connections present. |
| **3 — Proficient** | Diverse names present (8+ per course, 3+ groups). Most contexts are culturally varied. No stereotypes detected. At least 1 critical consciousness problem per course (grades 6+). Generally asset-based. |
| **2 — Developing** | Some name diversity but limited (5-7 names, 2 groups). Contexts are mostly generic/universal. Occasional stereotypical framing. No critical consciousness problems. Mixed asset/deficit framing. |
| **1 — Inadequate** | Minimal name diversity (<5 names or 1 group). Contexts are culturally narrow or biased. Stereotypes present. Deficit framing detected. No cultural math connections. |

### 8.2 CRT Audit Checklist

For each course, evaluate:

- [ ] **Name Diversity:** 10+ distinct names across 4+ cultural groups
- [ ] **Name-Context Independence:** Cultural names are NOT stereotypically paired with contexts
- [ ] **Context Variety:** Word problems draw from 5+ distinct cultural/community contexts
- [ ] **Family Structure Diversity:** Problems reference various family structures (single parents, grandparents, guardians, two-parent, multi-generational)
- [ ] **Asset Framing:** No instances of deficit language or assumptions about student communities
- [ ] **Critical Consciousness (Grades 6+):** At least 2 problems per course that use math to examine real-world equity issues
- [ ] **Cultural Math Connections:** At least 3 references per course to mathematical contributions from diverse cultures
- [ ] **Stereotype Audit:** No gendered, racial, ethnic, or socioeconomic stereotypes in problem contexts
- [ ] **Linguistic Inclusivity:** Mathematical terms scaffolded appropriately for ELL students; multilingual references when relevant

---

## 9. IMPLEMENTATION PRIORITIES

### Phase 1: Foundation (Current)
- [x] Document Cultural Responsivity Framework (this document)
- [x] Add `culturalBackground` to tutor personas
- [x] Integrate CRT rules into AI system prompt
- [x] Add Dimension 9 (CRT) to QA rubric

### Phase 2: Content Enhancement
- [ ] Audit all 12 courses against CRT checklist
- [ ] Enhance word problem banks with culturally diverse contexts
- [ ] Add critical consciousness problems to grades 6+ courses
- [ ] Expand name diversity across all modules

### Phase 3: Deepening
- [ ] Add multilingual tutor personas (Mandarin, Arabic, Vietnamese)
- [ ] Implement student cultural identity preferences (optional, student-driven)
- [ ] Develop Family Math take-home activities
- [ ] Create Cultural Math Spotlight content

### Phase 4: Sustaining
- [ ] Partner with educators from diverse communities for content review
- [ ] Establish ongoing CRT review cycle in QA process
- [ ] Collect student/family feedback on cultural relevance
- [ ] Iterate on persona backgrounds with community input

---

## 10. MEASUREMENT & ACCOUNTABILITY

### Quantitative Metrics
- Name diversity index per course (target: 10+ names, 4+ cultural groups)
- Context diversity index per course (target: 5+ distinct cultural contexts)
- Critical consciousness problem count (grades 6+, target: 2+ per course)
- Multilingual support coverage (languages served / languages needed)
- CRT QA dimension scores across all courses

### Qualitative Indicators
- Student engagement across demographic groups (no gaps)
- Student feedback on feeling "seen" and represented
- Family engagement rates across cultural communities
- Educator review of cultural authenticity

---

## 11. GUIDING PRINCIPLES — SUMMARY

1. **Every child** means every identity, language, and community
2. **High expectations** for ALL — rigor is equity
3. **Assets, not deficits** — students bring knowledge from home
4. **Mirrors and windows** — see yourself, see the world
5. **Math is multicultural** — it belongs to all of humanity
6. **Authenticity over tokenism** — depth, not decoration
7. **Critical consciousness** — math is a tool for understanding and improving the world
8. **Accessibility is justice** — inclusive design benefits everyone
9. **Community partnership** — families and communities are assets, not obstacles
10. **Continuous improvement** — cultural responsivity is a practice, not a checkbox

---

*This framework is a living document. It will evolve through educator input, community feedback, student voice, and ongoing research in culturally sustaining pedagogy.*
