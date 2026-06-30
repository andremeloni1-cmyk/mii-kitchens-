/*
 * shared/rooms.js — maintenance-report room parsing + the default checklist.
 *
 * Loaded in the browser (window.HubRooms) and Node (module.exports). Pure: no
 * DOM, no DB. Parses room names out of a job's scope text so a maintenance
 * report can be pre-populated room-by-room.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HubRooms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_CHECKLIST = [
    'Cabinetry installed, level & secured',
    'Doors & drawers aligned, operating smoothly',
    'Benchtop fitted — joins & edges finished/sealed',
    'Hardware (handles, hinges, runners) fitted & checked',
    'Appliances installed & tested (if applicable)',
    'Plumbing connections tested — no leaks (if applicable)',
    'Electrical / power points & lighting tested (if applicable)',
    'Silicone/sealant finished, site cleaned of offcuts & dust'
  ];

  function freshRoom(name) {
    return {
      name,
      items: DEFAULT_CHECKLIST.map(l => ({ label: l, done: false })),
      defects: '',
      photosNote: '',
      complete: false
    };
  }

  // Derive room names from a job's scope text (job_summary + client_name).
  function parseRooms(job) {
    const text = ((job.job_summary || '') + ' ' + (job.client_name || '')).toLowerCase();
    const names = [];
    const add = (name, count) => {
      count = count || 1;
      for (let i = 1; i <= count; i++) names.push(count > 1 ? (name + ' ' + i) : name);
    };
    if (/butler'?s?\s*pantry/.test(text)) add("Butler's Pantry");
    if (/walk[\s-]?in\s*pantry/.test(text)) add('Walk-in Pantry');
    else if (/\bpantry\b/.test(text) && !/butler/.test(text)) add('Pantry');
    if (/\bkitchen\b/.test(text)) add('Kitchen');
    if (/\blaundry\b|\bldry\b/.test(text)) add('Laundry');
    if (/\bensuite\b/.test(text)) add('Ensuite');
    if (/\bvanity\b/.test(text)) {
      const vm = text.match(/x\s*(\d+)\s*vanity|vanity[^.]*?x\s*(\d+)|(\d+)\s*x\s*vanity/);
      const n = vm ? parseInt(vm[1] || vm[2] || vm[3], 10) : 1;
      add('Vanity', n);
    }
    const hasHis = /his\s*robe/.test(text), hasHer = /her\s*robe/.test(text);
    if (hasHis) add('His Robe');
    if (hasHer) add('Her Robe');
    if (!hasHis && !hasHer && /\brobe\b/.test(text)) add('Robe');
    if (/alfresco/.test(text)) add('Alfresco');
    if (!names.length) add('Kitchen');
    return names;
  }

  return { DEFAULT_CHECKLIST, freshRoom, parseRooms };
});
