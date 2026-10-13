# Excellent Child Academy — School Management Portal

A full-stack starter website for managing the day-to-day work of a school. It includes a responsive web interface, an Express API, a local SQLite database, role-aware access, and email one-time passcodes (OTP).

## Included modules
- Dashboard overview
- Students: create, view, search, update and archive
- Staff directory
- Classes and class capacity
- Attendance records
- Fee records and payment status tracking
- Exam results / grades
- School announcements
- Messages / parent contact notes
- Email OTP sign-in, session cookie, logout
- Roles: admin, teacher, bursar, parent (starter permission rules)
- Audit log for key changes
- Basic API rate limiting, Helmet security headers, input checks, password hashing

## Important before using it with a real school
This is a working starter project, not a claim that a school can safely launch it without setup. Configure real email delivery, HTTPS, backups, database persistence, privacy notices, and local education/data-protection requirements before putting real student records online. The included SQLite database is suitable for local testing and small deployments; for a larger school, move to a managed database and add automated backups. Do not put `.env`, student data, or database files in GitHub.

## Run locally
Requirements: Node.js 20 or newer.

1. Extract the ZIP.
2. In a terminal, enter the project folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set a long random `JWT_SECRET`.
6. Run `npm run seed` to create the initial administrator.
7. Run `npm start`.
8. Open `http://localhost:3000`.

On first start, the seed command creates the admin using the values in `.env`. Change the password and use a real school-controlled email before deployment.

## Email login codes
The login page asks for an email address, then a six-digit code. To send actual emails, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in `.env`. Test the SMTP account first. In development without SMTP configured, the OTP is printed in the server terminal so you can test. In production, the app refuses to fall back to console OTP.

## Deploying
Use a Node.js hosting service that supports persistent storage, environment variables, and HTTPS. Set the start command to `npm start`. Configure the variables from `.env.example` in the host dashboard. Ensure the database path is on a persistent volume, or replace SQLite with a managed database. Configure `APP_BASE_URL` to the deployed HTTPS domain.

## Upload to GitHub from Android
1. Extract the ZIP using your file manager.
2. Create a new repository on GitHub named `excellent-child-academy`.
3. Upload the extracted project files/folders (not the ZIP itself if you want to edit files in the browser).
4. Confirm `.env` and any `data/` folder are not uploaded.
5. To make changes later, edit a file, commit the change, and deploy again.

If your Android app supports ZIP project import, import the ZIP there; if it only supports individual files, extract it first.

## Suggested next upgrades
- Parent/student portals with verified invitations
- Timetable and calendar
- Report-card PDF generation
- Fee receipts and payment gateway
- SMS/WhatsApp notifications
- File uploads with antivirus scanning
- Import/export CSV
- PostgreSQL migration and automated backups
- Multi-factor administrator protection and account recovery
- Tests, monitoring, and deployment pipeline

## Data and security notes
- This starter stores student names and records; use fictional data until deployment has been reviewed.
- Email OTP is an authentication factor, not proof that a person is a parent or staff member. Accounts must be created and role assignments verified by school administrators.
- OTPs expire after 10 minutes and are single-use.
- Login requests are rate-limited.
- Keep secrets in environment variables. Use HTTPS in production.
