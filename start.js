const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER = process.env.APP_USER || '';
const PASSWORD = process.env.APP_PASS || '';

if (!USER || !PASSWORD) {
  console.error("Please set APP_USER and APP_PASS env variables");
  process.exit();
}

// 1. Start pm2 without PROXY env
const name = 'gradient-app';
execSync(`APP_USER='${USER}' APP_PASS='${PASSWORD}' pm2 start app.js --name ${name}`);
console.log(`-> Started ${name} without proxy`);

// 2. Log completion message
console.log('-> √ Application started without proxy!');

// 3. Display pm2 status
execSync('pm2 status');
