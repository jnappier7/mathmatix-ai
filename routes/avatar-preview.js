// routes/avatar-preview.js
// Date: Tuesday, June 10, 2025 at 4:24:58 PM EDT

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs/promises'); // For async file operations

// This route will serve dynamic Lottie JSON files based on avatar customization parameters.
// NOTE: For this to work, you need actual Lottie JSON files on your server
// that correspond to the combinations of skin, hair, etc.
// For simplicity, this example will just serve a default idle animation
// if the exact combination is not found.
// In a real application, you might have a service that generates Lottie JSONs
// or stores pre-rendered combinations.

router.get('/preview', async (req, res) => {
    const { skin, hair, top, bottom, accessory } = req.query;

    // Construct a theoretical path to a Lottie JSON file based on parameters.
    // Example: /public/animations/avatars/skin_light_hair_short_top_hoodie.json
    let avatarJsonPath = path.join(__dirname, '..', 'public', 'animations', 'avatars');
    let fileName = '';

    // In a real app, you'd have complex logic here to map combinations to actual files.
    // For now, let's assume a simple mapping or just a default.

    // This is a placeholder logic. You need to implement how your custom avatars
    // map to Lottie JSON files.
    // If you have specific JSONs like 'skin_light.json', 'hair_short.json',
    // you might need to combine them or serve a single pre-made one.
    if (skin && hair) {
        // Example: If you have a file like 'default_skin_default_hair.json'
        fileName = `idle_${skin}_${hair}.json`; // This is hypothetical
    } else {
        fileName = 'idle.json'; // Fallback to a generic idle animation
    }

    const fullPath = path.join(avatarJsonPath, fileName);

    try {
        // Check if the specific file exists
        await fs.access(fullPath); // Throws if file does not exist
        console.log(`LOG: Serving avatar JSON: ${fullPath}`);
        res.sendFile(fullPath);
    } catch (error) {
        console.warn(`WARN: Avatar JSON not found: ${fullPath}. Falling back to default idle.`);
        // Fallback to the default idle animation if a specific combo is not found
        const defaultIdlePath = path.join(__dirname, '..', 'public', 'animations', 'idle.json');
        try {
            await fs.access(defaultIdlePath);
            res.sendFile(defaultIdlePath);
        } catch (defaultError) {
            console.error('ERROR: Default idle.json not found!', defaultError);
            res.status(404).json({ error: "Avatar animation not found, even default." });
        }
    }
});

module.exports = router;