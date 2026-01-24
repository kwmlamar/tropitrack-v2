const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputFile = path.join(__dirname, '../public/logo.png');
const outputDir = path.join(__dirname, '../public/icons');

// Create icons directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating PWA icons...\n');

  // Generate standard icons with transparent background (for light mode)
  console.log('Creating standard icons (transparent)...');
  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);

    try {
      await sharp(inputFile)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent
        })
        .png()
        .toFile(outputFile);

      console.log(`✓ Generated icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ Error generating icon-${size}x${size}.png:`, error.message);
    }
  }

  // Generate maskable icons with safe zone (80% of size) and primary color background
  console.log('\nCreating maskable icons (with background)...');
  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon-maskable-${size}x${size}.png`);
    const logoSize = Math.floor(size * 0.7); // Logo takes 70% of the icon
    const padding = Math.floor((size - logoSize) / 2);

    try {
      // Create a rounded square background with primary color
      const background = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 59, g: 130, b: 246, alpha: 1 } // Primary color #3B82F6
        }
      })
      .png()
      .toBuffer();

      // Resize logo and composite on background
      const logo = await sharp(inputFile)
        .resize(logoSize, logoSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      await sharp(background)
        .composite([{
          input: logo,
          top: padding,
          left: padding
        }])
        .png()
        .toFile(outputFile);

      console.log(`✓ Generated icon-maskable-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ Error generating icon-maskable-${size}x${size}.png:`, error.message);
    }
  }

  // Generate monochrome icons for dark theme (white logo on transparent)
  console.log('\nCreating monochrome icons (for dark theme)...');
  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon-monochrome-${size}x${size}.png`);

    try {
      // Read the original logo
      const logoBuffer = await sharp(inputFile)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      // Convert to monochrome white
      await sharp(logoBuffer)
        .tint({ r: 255, g: 255, b: 255 }) // Tint to white
        .png()
        .toFile(outputFile);

      console.log(`✓ Generated icon-monochrome-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ Error generating icon-monochrome-${size}x${size}.png:`, error.message);
    }
  }

  console.log('\n✅ All icons generated successfully!');
  console.log('\nIcon types created:');
  console.log('  • Standard (transparent) - Works on any background');
  console.log('  • Maskable (primary bg) - Safe zone for adaptive icons');
  console.log('  • Monochrome (white) - For dark theme home screens');
}

generateIcons().catch(console.error);
