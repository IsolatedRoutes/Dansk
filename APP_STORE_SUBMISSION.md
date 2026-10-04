# Broen — App Store submission pack

Everything to copy into App Store Connect. Plain English.

## 1. Support email (needed)
GitHub cannot give you a support address. Pick one:
- **Best:** a free forwarding address on your own domain, e.g. support@isolatedroutes.com. Most registrars offer free email forwarding, or use Cloudflare Email Routing (free). It forwards to your normal inbox, so your personal address stays private.
- **Quick:** a new free Gmail just for the app.
Then: (a) type it into `CONTACT_EMAIL` in `src/data/infoPages.js` (this makes "Contact" appear in the app menu), (b) add it to `privacy.html`, (c) paste it in App Store Connect as the Support contact. Apple also wants a Support **URL**; a page on isolatedroutes.com with the email works.

## 2. Review notes (paste into "App Review Information > Notes")
> Broen is a Danish-learning app. Studying and the Library work fully offline with no account and no sign-in; no demo account is needed.
>
> The optional AI features (Assistant, translate, photo reading) run through the user's own API key from Anthropic or Google. To test them: open the menu > AI settings, tap "I agree", choose Claude, and paste this test key: **[PASTE TEST KEY]**. The key is spending-limited and will be deleted after review.
>
> Native features: the key is stored in the iOS Keychain, camera and photo library access (to read Danish text in a picture), haptic feedback, backup/restore through the iOS share sheet, and the system rating prompt.
>
> No tracking, no analytics, no ads, no user accounts. Nothing is sent to the developer.

**How to make the test key (Anthropic):** console.anthropic.com > Settings > API keys > Create key. Add a small credit ($5) and set a low monthly spend limit under Limits. Name it "App Review". Delete it a week after approval. Do not reuse your personal key.

## 3. App Privacy answers (App Store Connect)
- Data collected by *you*: **None.** Nothing reaches your servers.
- Tracking: **No.**
- The AI feature sends text/photos to Anthropic or Google only when the user taps an AI button and has agreed. If Apple's form asks about third-party partners, answer honestly that user content (text, photos) is sent to the AI provider the user chose, for the app's functionality only, not for tracking.
- The privacy manifest (`PrivacyInfo.xcprivacy`) in the project matches this.

## 4. Listing text (draft)
- **Name:** Broen (see name check below; "Broen: Learn Danish" is safer)
- **Subtitle (30 chars):** Your bridge to learning Danish
- **Category:** Education (secondary: Reference)
- **Keywords (100 chars):** danish,dansk,learn danish,vocabulary,flashcards,grammar,translate,language,denmark,copenhagen
- **Description:** Broen is a Danish learning app for people who learn by noticing the world around them. About 8,000 words and phrases, organised by level and topic. Photograph a sign or paste Danish text and turn the words you want into your own cards. Known words come back later in new forms (past tense, plural, comparative), with no streaks, scores or timers. Optional AI companion for grammar questions, using your own Claude or Gemini account. Private by design: no account, no ads, no tracking. Works offline.
- **Copyright:** 2026 [your legal name]
- **Age rating:** answer the questionnaire honestly; the AI chat counts as unrestricted-style generated text, so expect 4+ to 12+ depending on Apple's current questions.
- **Price:** free or paid (the paid-apps agreement and tax forms are needed only if paid or in-app purchases).

## 5. Screenshots
iPhone only now. Apple currently asks for 6.9-inch iPhone screenshots (1320 x 2868). Take 4-6: Study card, Library, Assistant with a photo, Add card, Backup/Privacy. Check Apple's page for the exact current sizes before upload.

## 6. Name and trademark check (done on the web, not a legal opinion)
- No app named exactly "Broen" showed in a search, but there are apps called **BROEN Shopping** and **Broen T650**, and BROEN is also a Danish industrial valve company. Different business area, but check on **TMview** and the Danish Patent and Trademark Office for classes 9 and 41 before spending on marketing.
- Safer name if a conflict appears: "Broen: Learn Danish". The home-screen name can stay "Broen".

## 7. Word-list licence (FrequencyWords, CC BY-SA 4.0)
- You use it only to help choose which words appear; translations are your own, and credit is given in About and the FAQ. That is a reasonable position, and facts like "this word is common" are generally not copyrightable.
- The share-alike risk is if a lawyer sees the deck as an "adaptation" of the list. The list itself is not shipped. Low risk, but if you plan to sell the app, an hour with an IP lawyer is cheap insurance. The fallback is to pick the words from another source or by hand.

## 8. Checklist before pressing Submit
- [ ] Apple Developer account active; signing team chosen in Xcode
- [ ] Support email set (item 1) and in the app, privacy page and App Store Connect
- [ ] Privacy page published at its final address (isolatedroutes.com) with the Broen name; URL in App Store Connect
- [ ] Test key made and pasted into review notes
- [ ] TestFlight run on a real iPhone (see CAPACITOR.md checklist), including update-without-losing-progress and denying camera permission
- [ ] Screenshots, description, keywords, age rating, category, copyright
- [ ] Build number raised for each upload
- [ ] Name/trademark check
- [ ] Export compliance: already answered (no non-exempt encryption)
