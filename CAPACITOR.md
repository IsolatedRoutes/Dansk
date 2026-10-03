# Putting the app on the App Store (Capacitor)

Needs a Mac with Xcode and an Apple Developer account. Do these steps on the Mac.

## One-time setup
1. `git pull`, then `npm install`.
2. Check `capacitor.config.json`: `appId` is permanent once the app is submitted. Change `com.isolatedroutes.broen` if you want a different one.
3. `npx cap add ios` (creates the `ios/` folder; commit it).
4. `npm run cap:sync` builds the app and copies it into the iPhone project. Run it after every change.
5. `npx cap open ios` opens Xcode.

## In Xcode
- Signing: choose your Apple Developer team.
- App icon: drag `icons/icon-1024.png` into the AppIcon slot (no transparency).
- Add these to `Info.plist` (Apple rejects the app without them):
  - `NSCameraUsageDescription`: "Broen uses the camera so you can photograph Danish text to translate and learn from."
  - `NSPhotoLibraryUsageDescription`: "Broen reads the photo you choose so you can translate and learn from the Danish in it."
- Version and build number: raise the build number for every upload.
- Test on a real iPhone: studying, swipes, Back, Library, Backup (share sheet) and Restore, photo import with a key, reading aloud, no safe-area clipping.

## App Store Connect
- Privacy policy URL: https://isolatedroutes.github.io/Dansk/privacy.html
- Support contact: a real support email or URL is required (set `CONTACT_EMAIL` in `src/data/infoPages.js` too).
- App Privacy answers: the app collects nothing itself. Text and photos the person chooses to send go straight to the AI company they connect (Anthropic or Google) with their own key.
- Review notes: explain that AI features need the user's own API key, and give the reviewer a low-limit test key you can delete afterwards.
- Check the name Broen is available, and the word list license (FrequencyWords, CC BY-SA 4.0).

## What the iPhone app does differently
- The on-device model, Ollama and Chrome translator options are hidden.
- The service worker is not registered (the app is bundled inside).
- Progress is stored separately from the website version. To move over, use Backup on the website and Restore in the app.
