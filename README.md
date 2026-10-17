# CIVICINITY — Smart Civic Issue Reporting & Resolution System

A working full-stack student PBL project based on the provided synopsis.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript, Leaflet + OpenStreetMap
- Backend: Node.js + Express REST API
- Database: SQLite (`better-sqlite3`), persisted in `data/civicinity.sqlite`
- Authentication: bcrypt password hashing + JWT sessions
- Uploads: locally stored issue photos (JPG/PNG/WEBP, up to 5 MB)

## Requirements
- Node.js 18 or later (Node 20 LTS recommended)
- Internet connection for map tiles and Google Fonts when viewing the site
- Terminal / VS Code

## Run locally
1. Extract the ZIP.
2. Open the extracted `civicinity` folder in VS Code.
3. Open the integrated terminal in that folder.
4. Install packages:
   ```bash
   npm install
   ```
5. Create your local environment file:
   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
6. Edit `.env` and set `JWT_SECRET` to a long random string and change the admin password.
7. Start:
   ```bash
   npm start
   ```
8. Open `http://localhost:3000`.

The first startup creates the administrator account from `.env`.

## Default local demo admin
- Email: `admin@civicinity.local`
- Password: `ChangeMe123!`

Change these in `.env` before sharing the demo. If the database has already been created, changing `ADMIN_PASSWORD` does not reset the existing account password. To reset a disposable local demo, stop the server, delete `data/civicinity.sqlite` and its `-shm` / `-wal` companions if present, update `.env`, and restart. This deletes local demo data.

## Demo flow
1. Register a citizen account.
2. Submit a report with a category, description and location; attach a photo or use GPS.
3. Copy the generated `CIV-YYYY-XXXXXX` tracking ID.
4. Open a separate browser/incognito window and log in as admin.
5. Find the report in the authority dashboard, set department/priority/status and add a note.
6. Log back in as the citizen and view the report timeline. Resolve it from admin to enable feedback.
7. Add several sample reports to populate the analytics charts.

## Implemented API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/complaints` (multipart form with optional `photo`)
- `GET /api/complaints` (citizen sees own reports; admin sees all; optional `status`, `category`, `q`)
- `GET /api/complaints/track/:trackingId`
- `PATCH /api/complaints/:id` (admin only)
- `POST /api/complaints/:id/feedback` (owner, resolved complaints only)
- `GET /api/analytics` (admin only)
- `GET /api/updates`

## Important limitations / production checklist
This is a functional local prototype, not a deployed municipal service. Before real public deployment:
- use HTTPS and a strong unique `JWT_SECRET`;
- change the seeded admin credentials;
- store uploads in private object storage and validate image content, not only MIME type;
- add email/SMS/push notifications (the current app records updates in the timeline but does not send external messages);
- configure backups, retention, monitoring, and stricter production rate limits;
- use a production database and deploy behind a reverse proxy;
- obtain consent for GPS/photo collection and publish a privacy notice;
- restrict admin account creation to trusted operators;
- connect to an authorized municipal workflow before claiming that complaints are officially submitted.

The map's decorative pins on the landing page are illustrative. Actual user-submitted coordinates are saved with the complaint and exposed in the complaint detail as an OpenStreetMap link. The dashboard charts use real database data.
