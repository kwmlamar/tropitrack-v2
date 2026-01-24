# TropiTrack PWA Setup Guide

## Features Implemented

### ✅ Progressive Web App Infrastructure
- **Service Worker**: Automatic caching for offline support
- **Web Manifest**: PWA metadata for installation
- **App Icons**: Full icon set (72px - 512px) for all devices
- **Offline Queue**: Queues data when offline, syncs when connection returns

### ✅ Mobile-First Design
- **Bottom Navigation**: iOS/Android-style tab bar with 5 sections
  - Home (Dashboard)
  - Projects
  - Quick Add (elevated center button)
  - Invoices
  - More (Settings menu)
- **Mobile Time Entry**: Fast, touch-optimized time logging sheet
- **Quick Add Hub**: Common actions in large touch targets
- **Install Prompt**: Smart PWA installation prompts

### ✅ Offline Support
- **Offline Queue System**: Automatically queues changes when offline
- **Auto-Sync**: Syncs queued data when connection returns
- **Connection Status**: Visual indicator of online/offline state
- **Retry Logic**: Automatic retry with exponential backoff

## Testing the PWA

### Development Testing

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   Note: PWA is disabled in development mode for faster iteration

2. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

### Testing on Android

1. **Access via Chrome:**
   - Open Chrome on your Android device
   - Navigate to your deployment URL (or use ngrok for local testing)
   - Tap the menu (⋮) → "Install app" or "Add to Home screen"

2. **Verify Installation:**
   - App icon should appear on home screen
   - Opens in standalone mode (no browser UI)
   - Bottom navigation visible
   - Test offline mode by enabling Airplane Mode

### Testing on iOS

1. **Access via Safari:**
   - Open Safari on your iOS device
   - Navigate to your deployment URL
   - Tap the Share button (□↑)
   - Scroll down and tap "Add to Home Screen"
   - Tap "Add"

2. **Verify Installation:**
   - App icon should appear on home screen
   - Opens in standalone mode
   - Safe area insets handled correctly (notch, home indicator)
   - Test offline mode by enabling Airplane Mode

### Testing Offline Functionality

1. **Queue Test:**
   - Open the app while online
   - Navigate to Dashboard
   - Tap "Quick Time Entry"
   - Enable Airplane Mode or disconnect WiFi
   - Add workers and log time
   - Tap "Save" - should show "Queued for sync"
   - Re-enable connection
   - Data should sync automatically

2. **Connection Indicator:**
   - Watch for online/offline badge in mobile time entry sheet
   - Toast notifications should appear when going online/offline

## File Structure

```
/src/components/mobile/
  ├── mobile-nav.tsx          # Bottom tab navigation
  ├── mobile-time-entry.tsx   # Mobile time entry sheet
  └── install-prompt.tsx      # PWA install prompt

/src/hooks/
  └── use-offline-queue.ts    # Offline queue management

/src/app/
  ├── layout.tsx              # Updated with PWA metadata
  └── (dashboard)/
      ├── quick-add/          # Quick action shortcuts
      └── more/               # Settings overflow menu

/public/
  ├── manifest.json           # PWA manifest
  └── icons/                  # PWA icons (72-512px)

/scripts/
  └── generate-icons.js       # Icon generation script
```

## Key Features

### Mobile Time Entry
- **Large Touch Targets**: All buttons 48x48px minimum
- **Simple Workflow**: Date → Project → Add Workers → Save
- **Offline Support**: Works without connection
- **Visual Feedback**: Loading states, success/error messages

### Offline Queue System
- **Automatic Queueing**: Detects offline state and queues actions
- **Type Support**: Time entries, invoices, payments, expenses
- **Retry Logic**: Max 3 retries with error handling
- **Auto-Sync**: Syncs when connection restored
- **LocalStorage Persistence**: Queue survives page refreshes

### Install Prompt
- **Smart Timing**: Shows after 10 seconds on first visit
- **Dismissal Memory**: Won't show again for 7 days if dismissed
- **Platform Specific**: Different UI for iOS vs Android
- **Installation Detection**: Hides when already installed

## Performance Optimizations

- **Code Splitting**: Pages load on-demand
- **Image Optimization**: Next.js Image component
- **Caching Strategy**:
  - Fonts: CacheFirst (1 year)
  - Images: StaleWhileRevalidate (24 hours)
  - JS/CSS: StaleWhileRevalidate (24 hours)

## Deployment Checklist

- [ ] Build production version: `npm run build`
- [ ] Test on real Android device
- [ ] Test on real iOS device (iPhone/iPad)
- [ ] Verify offline functionality
- [ ] Check install prompt appears
- [ ] Test queue sync after going back online
- [ ] Verify icons display correctly
- [ ] Check safe area insets on notched devices
- [ ] Test on both light and dark mode

## Troubleshooting

### PWA not installing on Android
- Ensure HTTPS is enabled (required for PWA)
- Check manifest.json is accessible at /manifest.json
- Verify icons exist at /icons/icon-*.png
- Clear browser cache and try again

### PWA not installing on iOS
- Must be served over HTTPS
- Must use Safari browser
- Requires explicit "Add to Home Screen" action
- Check Web App Capable meta tag is set

### Offline queue not working
- Check browser console for errors
- Verify localStorage is not disabled
- Check network detection in DevTools (Application → Service Workers)
- Ensure Supabase client is properly configured

### Service worker not updating
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Clear application cache in DevTools
- Unregister old service worker in DevTools
- Update version in manifest.json

## Browser Support

- ✅ Chrome/Edge (Android): Full PWA support
- ✅ Safari (iOS): Add to Home Screen support
- ✅ Samsung Internet: Full PWA support
- ⚠️ Firefox (Android): Limited PWA support
- ❌ Desktop browsers: Can install but limited mobile features

## Next Steps

1. Deploy to production (Vercel recommended)
2. Test on real devices
3. Monitor Service Worker registration in production
4. Track PWA install rate via analytics
5. Gather user feedback on mobile experience

## Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Next PWA Guide](https://github.com/shadowwalker/next-pwa)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
