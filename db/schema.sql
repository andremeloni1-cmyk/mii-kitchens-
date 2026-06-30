-- Mii Kitchens Hub — database schema (MySQL 8 / MariaDB 10.4+)
--
-- One-time import on the VPS:
--   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS mii_hub CHARACTER SET utf8mb4;"
--   mysql -u root -p mii_hub < db/schema.sql
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + idempotent seeds. Adding a
-- column later? Append an ALTER TABLE ... ADD COLUMN IF NOT EXISTS at the end.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- Employees — every drafter / installer / admin who logs in. Replaces the old
-- single admin_user model. `email` is the login; `password_hash` is bcrypt
-- (set via scripts/setpw.js). `employee_code` is the stable key the calendar
-- sync and job assignments reference.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(160) NOT NULL,
  employee_code VARCHAR(64)  NOT NULL,
  role          ENUM('admin','drafter','installer') NOT NULL DEFAULT 'drafter',
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  phone         VARCHAR(60)  NULL,
  color         CHAR(7)      NOT NULL DEFAULT '#4a86e8',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_emp_code (employee_code),
  UNIQUE KEY uniq_emp_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- OAuth tokens for Google (one row, provider = 'google'). Optional — the
-- Apps Script holds its own Google auth; kept for a future server-side path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider      VARCHAR(32)  NOT NULL,
  access_token  TEXT         NULL,
  refresh_token TEXT         NULL,
  expires_at    INT UNSIGNED NULL,
  scope         TEXT         NULL,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Clients — the people/builders a job is for.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(160) NOT NULL,
  email      VARCHAR(190) NULL,
  phone      VARCHAR(60)  NULL,
  notes      TEXT         NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Jobs — the whole pipeline, not just installs.
--   stage  : where the job sits in the Mii workflow.
--   status : the install-approval state (kept distinct from stage; preserved
--            on calendar re-sync, like assignments).
-- `job_reference` is the unique upsert key the Apps Script sync writes against.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_reference        VARCHAR(64)  NOT NULL,
  client_id            INT UNSIGNED NULL,
  client_name          VARCHAR(160) NULL,
  company              VARCHAR(160) NULL DEFAULT 'Mii Kitchens',
  site_address         VARCHAR(255) NULL,
  contact_name         VARCHAR(160) NULL,
  contact_phone        VARCHAR(60)  NULL,
  contact_email        VARCHAR(190) NULL,
  job_summary          TEXT         NULL,
  pdf_links            JSON         NULL,
  assigned_drafter_id   INT UNSIGNED NULL,
  assigned_installer_id INT UNSIGNED NULL,
  stage   ENUM('check_measure','drafting','review','client_signoff','production','install','maintenance','complete')
          NOT NULL DEFAULT 'check_measure',
  status  ENUM('Pending','Approved','Scheduled','Declined') NOT NULL DEFAULT 'Pending',
  is_tentative         TINYINT(1)   NOT NULL DEFAULT 0,
  start_date           DATE         NULL,
  end_date             DATE         NULL,
  days_required        INT          NULL DEFAULT 1,
  check_measure_date   DATE         NULL,
  client_meeting       DATETIME     NULL,
  signoff_date         DATE         NULL,
  gcal_event_id        VARCHAR(255) NULL,
  notes                TEXT         NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_job_reference (job_reference),
  KEY idx_stage (stage),
  KEY idx_status (status),
  KEY idx_starts (start_date),
  KEY idx_drafter (assigned_drafter_id),
  KEY idx_installer (assigned_installer_id),
  CONSTRAINT fk_jobs_client    FOREIGN KEY (client_id)             REFERENCES clients(id)   ON DELETE SET NULL,
  CONSTRAINT fk_jobs_drafter   FOREIGN KEY (assigned_drafter_id)   REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_jobs_installer FOREIGN KEY (assigned_installer_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Meetings — discrete scheduled touchpoints (client meetings, check-measures,
-- installs, reviews). Lets the board show single-point events as their own
-- chips alongside multi-day install blocks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id    VARCHAR(64)  NOT NULL,
  type          ENUM('client_meeting','check_measure','install','review','internal') NOT NULL DEFAULT 'client_meeting',
  job_id        INT UNSIGNED NULL,
  employee_id   INT UNSIGNED NULL,
  title         VARCHAR(200) NOT NULL,
  starts_at     DATETIME     NOT NULL,
  ends_at       DATETIME     NULL,
  location      VARCHAR(255) NULL,
  notes         TEXT         NULL,
  gcal_event_id VARCHAR(255) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_meeting_id (meeting_id),
  KEY idx_meeting_starts (starts_at),
  KEY idx_meeting_emp (employee_id),
  CONSTRAINT fk_meet_job FOREIGN KEY (job_id)      REFERENCES jobs(id)      ON DELETE CASCADE,
  CONSTRAINT fk_meet_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Maintenance reports — one per job per author. `rooms` holds the per-room
-- checklist JSON (same shape as the dashboard's freshReport). Keyed per
-- employee so admin sees everyone's.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id      VARCHAR(64)  NOT NULL,
  job_id         INT UNSIGNED NOT NULL,
  job_reference  VARCHAR(64)  NULL,
  employee_id    INT UNSIGNED NULL,
  technician_name VARCHAR(160) NULL,
  report_date    DATE         NULL,
  send_to        VARCHAR(190) NULL,
  rooms          JSON         NULL,
  overall_notes  TEXT         NULL,
  status         ENUM('draft','sent') NOT NULL DEFAULT 'draft',
  sent_at        DATETIME     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_report_id (report_id),
  KEY idx_report_job (job_id),
  KEY idx_report_emp (employee_id),
  CONSTRAINT fk_reports_job FOREIGN KEY (job_id)      REFERENCES jobs(id)      ON DELETE CASCADE,
  CONSTRAINT fk_reports_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Seed: the company + a starter team. Passwords are NULL — set them with
--   node scripts/setpw.js <email> <password>
-- Re-running is safe (INSERT IGNORE on the unique email/code).
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO clients (name) VALUES ('Mii Kitchens');

INSERT IGNORE INTO employees (full_name, employee_code, role, email, color) VALUES
  ('André (Admin)',  'ADMIN-ANDRE',  'admin',     'andre@miikitchen.com.au',   '#1f2430'),
  ('Drafter One',    'DRAFT-ONE',    'drafter',   'drafter1@miikitchen.com.au','#4a86e8'),
  ('Drafter Two',    'DRAFT-TWO',    'drafter',   'drafter2@miikitchen.com.au','#34a853'),
  ('Drafter Three',  'DRAFT-THREE',  'drafter',   'drafter3@miikitchen.com.au','#f9ab00'),
  ('Drafter Four',   'DRAFT-FOUR',   'drafter',   'drafter4@miikitchen.com.au','#a142f4'),
  ('Installer Sam',  'INST-SAM',     'installer', 'sam@miikitchen.com.au',     '#0f9d9d'),
  ('Installer Lee',  'INST-LEE',     'installer', 'lee@miikitchen.com.au',     '#e8710a');
