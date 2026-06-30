'use strict';
/*
 * server/jobsRepo.js — job reads/writes shared by the jobs, assign and sync
 * routes, so the role-scoping and the API shape live in exactly one place.
 */
const db = require('./db');

// Jobs joined to the assigned drafter/installer so the API can expose their
// employee_code (the dashboard colours + filters by it).
const JOB_SELECT = `
  SELECT j.id, j.job_reference, j.client_name, j.company, j.site_address,
         j.contact_name, j.contact_phone, j.contact_email, j.job_summary,
         j.pdf_links, j.stage, j.status, j.is_tentative,
         j.start_date, j.end_date, j.days_required,
         j.check_measure_date, j.client_meeting, j.signoff_date,
         j.notes, j.gcal_event_id,
         dr.employee_code AS assigned_drafter,   dr.full_name AS drafter_name,
         ins.employee_code AS assigned_installer, ins.full_name AS installer_name
  FROM jobs j
  LEFT JOIN employees dr  ON dr.id  = j.assigned_drafter_id
  LEFT JOIN employees ins ON ins.id = j.assigned_installer_id`;

function mapJob(row) {
  if (!row) return null;
  return {
    job_reference: row.job_reference,
    client_name: row.client_name || '',
    company: row.company || 'Mii Kitchens',
    site_address: row.site_address || '',
    contact_name: row.contact_name || '',
    contact_phone: row.contact_phone || '',
    contact_email: row.contact_email || '',
    job_summary: row.job_summary || '',
    pdf_links: Array.isArray(row.pdf_links) ? row.pdf_links : (row.pdf_links ? safeJson(row.pdf_links) : []),
    stage: row.stage,
    status: row.status,
    is_tentative: !!row.is_tentative,
    start_date: row.start_date,
    end_date: row.end_date,
    days_required: row.days_required || 1,
    check_measure_date: row.check_measure_date,
    client_meeting: row.client_meeting,
    signoff_date: row.signoff_date,
    assigned_drafter: row.assigned_drafter || null,
    drafter_name: row.drafter_name || null,
    assigned_installer: row.assigned_installer || null,
    installer_name: row.installer_name || null,
    notes: row.notes || ''
  };
}

function safeJson(v) { try { return JSON.parse(v); } catch (_) { return []; } }

// Role-scoped job list: admin sees all; a drafter/installer sees only theirs.
async function listForUser(user) {
  let where = '', params = {};
  if (user.role === 'drafter') { where = ' WHERE j.assigned_drafter_id = :uid'; params = { uid: user.id }; }
  else if (user.role === 'installer') { where = ' WHERE j.assigned_installer_id = :uid'; params = { uid: user.id }; }
  const rows = await db.query(JOB_SELECT + where + ' ORDER BY j.start_date IS NULL, j.start_date', params);
  return rows.map(mapJob);
}

async function getByReference(ref) {
  const row = await db.queryOne(JOB_SELECT + ' WHERE j.job_reference = :ref', { ref });
  return mapJob(row);
}

// Can this user see this job?
function canView(user, job) {
  if (!job) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'drafter') return job.assigned_drafter === user.employee_code;
  if (user.role === 'installer') return job.assigned_installer === user.employee_code;
  return false;
}

async function employeeIdByCode(code) {
  if (!code) return null;
  const row = await db.queryOne('SELECT id FROM employees WHERE employee_code = :code', { code });
  return row ? row.id : null;
}

module.exports = { JOB_SELECT, mapJob, listForUser, getByReference, canView, employeeIdByCode };
