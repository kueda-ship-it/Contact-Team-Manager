import sharp from 'sharp';
import fs from 'fs';

async function processIcon() {
    const input = "public/pwa-512x512.png";
    if (!fs.existsSync(input)) {
        console.error("pwa-512x512.png not found");
        process.exit(1);
    }

    // 1. Trim transparent/white borders to get only the logo core
    const { data } = await sharp(input)
        .trim({ threshold: 10 })
        .toBuffer({ resolveWithObject: true });

    // 2. We want it to fill the 512x512 frame, but a 512x512 square icon on iOS gets rounded corners.
    // The safe zone for a squircle is roughly the center 80% (scale 0.8).
    // 512 * 0.8 = 410. So let's resize the logo to 410x410 (contain) 
    // and paste it in the center of a 512x512 white background.

    const logoSize = 410; // leaves ~20% total padding (10% each side)

    const resizedBuffer = await sharp(data)
        .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background for this intermediate
        })
        .toBuffer();

    // Create the final 512x512 white background and composite the resized logo over it
    await sharp({
        create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    })
        .composite([{ input: resizedBuffer, gravity: 'center' }])
        .toFormat('png')
        .toFile('public/pwa-512x512.png');

    // Do the same for 192x192 (192 * 0.8 = 153.6 ~ 154)
    const logoSize192 = 154;
    const resizedBuffer192 = await sharp(data)
        .resize(logoSize192, logoSize192, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .toBuffer();

    await sharp({
        create: {
            width: 192,
            height: 192,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    })
        .composite([{ input: resizedBuffer192, gravity: 'center' }])
        .toFormat('png')
        .toFile('public/pwa-192x192.png');

    console.log("Successfully padded icons for rounded crop!");
}

processIcon().catch(console.error);
