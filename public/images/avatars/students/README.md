# Student preset avatars

Polished human "student" character art (the tutor-style glow-up), offered as
premium preset avatars in the avatar picker.

## How to add a preset (drop-in)

1. Export the character as a **transparent-background PNG**, consistent framing
   (full body, centered), and save it here with the exact filename below.
2. It renders automatically — no code change needed if the id is already listed.

The picker **auto-hides** any preset whose PNG isn't present yet, so it's safe
for the catalog to list a preset before its art lands.

## Expected files (current catalog entries)

| Catalog id         | File            | Character | Notes |
|--------------------|-----------------|-----------|-------|
| `student.navy`     | `navy.png`      | Jayden    | navy hoodie, khaki cargos, "M" sneakers |
| `student.charcoal` | `charcoal.png`  | Jordan    | charcoal hoodie, black joggers — **redo shoes (currently Jordan-1 look-alikes → use original design)** |
| `student.lavender` | `lavender.png`  | Emily     | lavender hoodie, jeans |
| `student.pink`     | `pink.png`      | Aaliyah   | pink tee, denim cargos |
| `student.green`    | `green.png`     | Carlos    | green tee, khaki cargos |
| `student.cream`    | `cream.png`     | Mei       | cream sweater, grey cargos |
| `student.gold`     | `gold.png`      | Sofia     | gold/yellow hoodie |

To add more, drop the PNG here and add a matching row to **both**
`utils/avatarCatalog.js` (canonical) and `public/js/avatar-config-data.js`
(client mirror) under `STUDENT_PRESETS`.

## Art guidelines

- Stylized (tutor universe / modern-animated), transparent background.
- Keep the **"M" branding**; **avoid real-brand clothing/shoe likenesses**
  (no swooshes, no Jordan silhouettes) — trademark risk on a K-12 product.
- Consistent crop/scale so avatars line up in the picker and chat.
