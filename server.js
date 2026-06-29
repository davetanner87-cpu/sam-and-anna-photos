require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Simple in-memory session store (good enough for one-night event)
const sessions = {};

// ─── OAuth2 Setup ───────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// If we have a stored token, load it
const TOKEN_PATH = path.join(__dirname, '.token.json');
if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
}

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  }
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ─── Auth Routes ────────────────────────────────────────────────
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.redirect('/admin');
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).send('Auth failed: ' + err.message);
  }
});

// ─── Helper: Get or Create Drive Folder ─────────────────────────
async function getOrCreateFolder() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (folderId) return folderId;

  // Create a new folder if none configured
  const folderName = `${process.env.EVENT_NAME || "Wedding"} Photos - ${process.env.EVENT_DATE || "2026"}`;
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });
  console.log('Created Drive folder:', folder.data.id);
  return folder.data.id;
}

// ─── Upload Route ────────────────────────────────────────────────
app.post('/upload', upload.array('photos', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploaderName = (req.body.name || 'Guest').trim().substring(0, 50);
  const results = [];
  const errors = [];

  try {
    const folderId = await getOrCreateFolder();

    for (const file of req.files) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = uploaderName.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Guest';
        const ext = path.extname(file.originalname) || '.jpg';
        const fileName = `${safeName} - ${timestamp}${ext}`;

        const response = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
          },
          media: {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
          },
          fields: 'id, name, webViewLink'
        });

        results.push({ name: fileName, id: response.data.id });
        fs.unlinkSync(file.path); // clean up temp file
      } catch (fileErr) {
        console.error('File upload error:', fileErr);
        errors.push(file.originalname);
        try { fs.unlinkSync(file.path); } catch(e) {}
      }
    }

    if (results.length > 0) {
      res.json({ 
        success: true, 
        uploaded: results.length,
        failed: errors.length,
        message: `${results.length} photo${results.length !== 1 ? 's' : ''} uploaded successfully!`
      });
    } else {
      res.status(500).json({ error: 'All uploads failed', failed: errors });
    }

  } catch (err) {
    console.error('Upload error:', err);
    // Clean up any remaining temp files
    for (const file of req.files) {
      try { fs.unlinkSync(file.path); } catch(e) {}
    }
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// ─── Gallery Route (live photo feed) ────────────────────────────
app.get('/gallery-data', async (req, res) => {
  try {
    const folderId = await getOrCreateFolder();
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, createdTime, thumbnailLink, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 100
    });
    res.json({ photos: response.data.files || [] });
  } catch (err) {
    console.error('Gallery error:', err);
    res.status(500).json({ photos: [], error: err.message });
  }
});

// ─── Admin Route ─────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  const isAuthed = fs.existsSync(TOKEN_PATH);
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin — ${process.env.EVENT_NAME || 'Wedding Photos'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .status { padding: 12px 20px; border-radius: 8px; margin: 20px 0; font-weight: 600; }
        .ok { background: #d4edda; color: #155724; }
        .err { background: #f8d7da; color: #721c24; }
        a.btn { display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; margin: 8px 4px; font-size: 14px; }
        a.btn:hover { background: #333; }
        .url { background: #f5f5f5; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 8px 0; }
      </style>
    </head>
    <body>
      <h1>🎊 Wedding Photo Admin</h1>
      <p>${process.env.EVENT_NAME || 'Sam & Anna'} · ${process.env.EVENT_DATE || 'July 4, 2026'}</p>
      
      <div class="status ${isAuthed ? 'ok' : 'err'}">
        ${isAuthed ? '✅ Google Drive connected' : '❌ Not connected to Google Drive'}
      </div>

      ${!isAuthed ? `<a href="/auth" class="btn">Connect Google Drive</a>` : ''}

      <h3>Share Link</h3>
      <div class="url">${process.env.APP_URL || 'http://localhost:3000'}/</div>
      
      <h3>Gallery</h3>
      <div class="url">${process.env.APP_URL || 'http://localhost:3000'}/gallery</div>

      <h3>QR Code</h3>
      <div class="url">${process.env.APP_URL || 'http://localhost:3000'}/qr</div>

      <br>
      <a href="/" class="btn">View Upload Page</a>
      <a href="/gallery" class="btn">View Gallery</a>
      <a href="/qr" class="btn">Download QR Code</a>
    </body>
    </html>
  `);
});

// ─── QR Code Route ───────────────────────────────────────────────
app.get('/qr', async (req, res) => {
  const QRCode = require('qrcode');
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const qrBuffer = await QRCode.toBuffer(appUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="wedding-qr.png"');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

// ─── Serve HTML pages ────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));

// ─── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎊 Wedding photo app running on port ${PORT}`);
  console.log(`📸 Upload page: http://localhost:${PORT}/`);
  console.log(`🖼️  Gallery: http://localhost:${PORT}/gallery`);
  console.log(`⚙️  Admin: http://localhost:${PORT}/admin`);
});
