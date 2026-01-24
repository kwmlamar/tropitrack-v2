# PWA Icons Guide

## Icon Types Generated

TropiTrack now has **24 PWA icons** in 3 different variants to ensure perfect display across all devices and themes:

### 📱 Icon Variants

#### 1. **Standard Icons** (`icon-{size}.png`)
- **Purpose**: Default icons that work on any background
- **Background**: Transparent
- **Best For**: Light mode home screens, default installations
- **Sizes**: 72, 96, 128, 144, 152, 192, 384, 512px

```json
{
  "src": "/icons/icon-192x192.png",
  "purpose": "any"
}
```

#### 2. **Maskable Icons** (`icon-maskable-{size}.png`)
- **Purpose**: Adaptive icons for Android (Material You)
- **Background**: Primary color (#3B82F6)
- **Safe Zone**: Logo scaled to 70% with padding
- **Best For**: Android adaptive icons, rounded/shaped masks
- **Sizes**: 72, 96, 128, 144, 152, 192, 384, 512px

```json
{
  "src": "/icons/icon-maskable-192x192.png",
  "purpose": "maskable"
}
```

**Why Maskable Icons?**
Android can apply various shapes (circle, rounded square, squircle) to app icons. Maskable icons include a safe zone that ensures the logo stays visible regardless of the shape applied.

#### 3. **Monochrome Icons** (`icon-monochrome-{size}.png`)
- **Purpose**: Dark theme optimization
- **Background**: Transparent
- **Color**: White (#FFFFFF)
- **Best For**: Dark mode home screens, icon tinting
- **Sizes**: 192, 512px (most commonly used)

```json
{
  "src": "/icons/icon-monochrome-192x192.png",
  "purpose": "monochrome"
}
```

**Why Monochrome Icons?**
On dark theme home screens, monochrome icons allow the OS to apply system-wide theming and ensure icons look consistent with the dark aesthetic.

## How Different Devices Use These Icons

### Android (Chrome)
1. **Default**: Uses `any` purpose icons
2. **Adaptive Icons**: Uses `maskable` icons and applies shape mask
3. **Material You**: Can tint `monochrome` icons to match system theme

### iOS (Safari)
1. **Home Screen**: Uses `any` purpose icons
2. **Dark Mode**: OS may automatically adjust or use `monochrome` if available
3. **Size Preference**: Typically uses 180x180, falls back to 192x192

### PWA Installation Dialog
- Uses highest resolution icon (512x512) for preview
- Shows both standard and maskable variants depending on OS

## Testing Your Icons

### Visual Test Checklist

**Light Mode:**
- [ ] Icon visible and clear
- [ ] Transparent background works well
- [ ] Logo not cut off on any edges

**Dark Mode:**
- [ ] Icon visible on dark background
- [ ] Monochrome version looks good
- [ ] Sufficient contrast

**Adaptive/Masked (Android):**
- [ ] Logo stays within safe zone when circular mask applied
- [ ] Logo stays within safe zone when squircle mask applied
- [ ] Primary color background looks good

## Icon Generation Script

The icons are generated using `/scripts/generate-icons.js`:

```bash
# Regenerate all icons
npm run generate-icons

# Or manually
node scripts/generate-icons.js
```

### What the Script Does:

1. **Reads** `/public/logo.png` as source
2. **Generates** standard icons with transparent background
3. **Generates** maskable icons with primary color background and safe zone
4. **Generates** monochrome icons by tinting to white
5. **Outputs** all 24 variants to `/public/icons/`

## Manifest Configuration

The `manifest.json` now includes all icon variants:

```json
{
  "icons": [
    // Standard icons (8 sizes)
    { "purpose": "any" },

    // Maskable icons (8 sizes)
    { "purpose": "maskable" },

    // Monochrome icons (2 sizes)
    { "purpose": "monochrome" }
  ]
}
```

## Best Practices

### ✅ Do:
- Keep source logo (`/public/logo.png`) high resolution (at least 512x512)
- Test icons on both light and dark home screens
- Verify maskable icons with safe zone tester
- Regenerate icons if logo changes

### ❌ Don't:
- Use text in icons (hard to read at small sizes)
- Make logo too detailed (simplicity scales better)
- Forget to test on real devices
- Use only one icon variant

## Safe Zone Guide (Maskable Icons)

Maskable icons use a **70% safe zone** to ensure visibility when shaped:

```
┌──────────────────┐
│  15% padding     │
│  ┌──────────┐   │
│  │          │   │
│  │  70% of  │   │
│  │   logo   │   │
│  │          │   │
│  └──────────┘   │
│  15% padding     │
└──────────────────┘
```

## Debugging Icons

### Chrome DevTools (Desktop)
1. Open DevTools → Application → Manifest
2. Check "Icons" section shows all variants
3. Verify paths are correct
4. Test icon download

### Android Chrome
1. Install PWA
2. Long-press app icon → Edit
3. Check if adaptive icon shape can be changed
4. Verify icon looks good in all shapes

### iOS Safari
1. Add to Home Screen
2. Check icon on home screen
3. Switch to dark mode
4. Verify icon visibility

## Icon Sizes Explained

- **72x72**: Android small launcher icon
- **96x96**: Android normal launcher icon
- **128x128**: Chrome Web Store small icon
- **144x144**: Windows tile icon
- **152x152**: iOS iPad touch icon
- **192x192**: Chrome PWA icon (most common)
- **384x384**: Chrome splash screen icon
- **512x512**: High-res for install dialog and app stores

## Troubleshooting

**Icon not showing after installation:**
- Clear browser cache
- Uninstall and reinstall PWA
- Check manifest.json is accessible
- Verify icon files exist at specified paths

**Icon looks blurry:**
- Ensure source logo is high resolution
- Regenerate icons
- Check correct size is being used

**Icon cut off on Android:**
- Use maskable icons
- Increase safe zone padding in generation script
- Test with different shape masks

**Icon not visible in dark mode:**
- Ensure monochrome icons are included
- Check icon contrast
- Test on actual dark mode device

## Resources

- [Maskable.app Icon Editor](https://maskable.app/editor)
- [PWA Icon Guidelines](https://web.dev/add-manifest/#icons)
- [Android Adaptive Icons](https://developer.android.com/guide/practices/ui_guidelines/icon_design_adaptive)
- [iOS Icon Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
