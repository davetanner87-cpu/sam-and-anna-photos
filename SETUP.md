# Sam & Anna Wedding Photo App — Setup Guide

## What it does
- Guests scan a QR code → mobile upload page opens in browser
- They enter their name + select photos from camera roll → upload
- Photos land directly in a Google Drive folder Sam & Anna own
- Live gallery page auto-refreshes every 15 seconds showing new photos
- Can be displayed on a TV/screen at the reception

---

## Step 1 — Google OAuth Credentials

1. Go to https://console.cloud.google.com/
2. Create or select a project
3. **APIs & Services → Enable APIs** → enable **Google Drive API**
4. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: "Wedding Photos"
7. Authorized redirect URIs: add `https://YOUR-RAILWAY-URL.up.railway.app/auth/callback`
8. Download the JSON → save as `~/.openclaw/secrets/google-drive-oauth.json`

---

## Step 2 — Create Google Drive Folder

1. Go to drive.google.com (signed in as davetanner87@gmail.com)
2. Create a new folder: "Sam & Anna Wedding Photos"
3. Copy the folder ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
4. Share the folder with Sam & Anna's Google accounts

---

## Step 3 — Deploy to Railway

```bash
cd ~/Documents/Sovereign/wedding-photos
railway login
railway init
railway up
```

Then set environment variables in Railway dashboard:
- `GOOGLE_CLIENT_ID` — from OAuth JSON
- `GOOGLE_CLIENT_SECRET` — from OAuth JSON  
- `GOOGLE_REDIRECT_URI` — https://YOUR-URL.up.railway.app/auth/callback
- `GOOGLE_DRIVE_FOLDER_ID` — from Step 2
- `SESSION_SECRET` — any random string
- `APP_URL` — https://YOUR-URL.up.railway.app
- `EVENT_NAME` — Sam & Anna's Wedding
- `EVENT_DATE` — July 4, 2026

---

## Step 4 — Authorize Google Drive

1. Visit `https://YOUR-URL.up.railway.app/admin`
2. Click **Connect Google Drive**
3. Sign in with davetanner87@gmail.com
4. Approve Drive access
5. Admin page should show ✅ Google Drive connected

---

## Step 5 — Get the QR Code

1. Visit `https://YOUR-URL.up.railway.app/qr`
2. Downloads a PNG — print it out, put it on tables
3. Test by scanning with your phone

---

## URLs

| Page | URL |
|------|-----|
| Upload (guests scan this) | `https://YOUR-URL.up.railway.app/` |
| Live gallery (TV screen) | `https://YOUR-URL.up.railway.app/gallery` |
| QR code download | `https://YOUR-URL.up.railway.app/qr` |
| Admin / status | `https://YOUR-URL.up.railway.app/admin` |

---

## On the Night

- Pull up `/gallery` on a TV or laptop at the reception
- Photos appear automatically as guests upload — refreshes every 15 seconds
- All photos also land in Google Drive in real time
- After the event, Sam & Anna download everything from their Drive folder
