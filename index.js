'use strict';
/*
 * Root entry point. Managed hosts (e.g. Hostinger's Git import) detect the app
 * from package.json `main`/`start` and a root entry file — this boots the
 * Express server defined in server/index.js.
 */
require('./server/index.js').start();
