# StudyFlow

StudyFlow is a modern student productivity hub prototype designed for university and college students.

## Included features

- Landing page
- Local authentication flow
- Dashboard
- Tasks
- Subjects
- Assignment tracker
- Exam countdown
- Pomodoro timer
- Notes
- Weekly timetable
- Productivity analytics
- GPA / percentage / grade calculators
- Profile settings
- Export local data as JSON
- Responsive mobile layout

## Run locally

This version is intentionally dependency-free so it can be opened immediately:

1. Extract the ZIP.
2. Open `index.html` in a browser.

For development, use VS Code + Live Server if preferred.

## GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html`, `styles.css`, and `app.js`.
3. Open repository **Settings → Pages**.
4. Select **Deploy from a branch**.
5. Select the `main` branch and `/root`.
6. Save.

## Important: current architecture

This first build is a polished frontend MVP. Data is stored in the browser with `localStorage`, so each browser/device has its own data.

A real multi-device full-stack version should replace the local authentication/storage layer with a backend such as Supabase (PostgreSQL + Auth + Storage). Do not put private API keys or service-role keys into a GitHub Pages frontend.

## Suggested next production upgrades

- Supabase authentication
- PostgreSQL tables + row-level security
- Cloud notes and user profiles
- Email/password + OAuth login
- PWA/offline support
- SEO landing pages
- Analytics
- Custom domain
- Privacy policy / terms
- Monetization
