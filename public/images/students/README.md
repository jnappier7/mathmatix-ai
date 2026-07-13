# Student preset avatars

Polished human "student" character art (the tutor-style glow-up), offered as
premium preset avatars in the avatar picker.

## Location
Files live **here** (`public/images/students/`). The catalog references them by
absolute path (`/images/students/<file>.png`).

## How to add / change a preset
1. Export the character as a **transparent-background PNG**, consistent framing
   (full body, centered), and save it here with the filename below.
2. It renders automatically. The picker **auto-hides** any preset whose PNG is
   missing, so it's safe for the catalog to list one before its art lands.

## Current catalog entries (8)

| Catalog id         | File            | Character | Notes |
|--------------------|-----------------|-----------|-------|
| `student.navy`     | `navy.png`      | (hero)    | navy hoodie, curly brown hair, "M" sneakers |
| `student.blue`     | `blue.png`      | Jayden    | blue hoodie, black spiky hair |
| `student.charcoal` | `charcoal.png`  | Jordan    | charcoal hoodie — **redo shoes (Jordan-1 look-alikes → original design)** |
| `student.lavender` | `lavender.png`  | Emily     | lavender hoodie, jeans |
| `student.pink`     | `pink.png`      | Aaliyah   | pink tee, denim cargos |
| `student.forrest`  | `forrest.png`   | Carlos    | forest-green tee, khaki cargos |
| `student.yellow`   | `yellow.png`    | Mei?      | confirm which character this is (yellow vs gold) |
| `student.gold`     | `gold.png`      | Sofia     | gold/yellow hoodie, jeans |

To add more, drop the PNG here and add a matching row to **both**
`utils/avatarCatalog.js` (canonical) and `public/js/avatar-config-data.js`
(client mirror) under `STUDENT_PRESETS`.

## Art guidelines
- Stylized (tutor universe / modern-animated), transparent background.
- Keep the **"M" branding**; **avoid real-brand clothing/shoe likenesses**
  (no swooshes, no Jordan silhouettes) — trademark risk on a K-12 product.
- Consistent crop/scale so avatars line up in the picker and chat.
