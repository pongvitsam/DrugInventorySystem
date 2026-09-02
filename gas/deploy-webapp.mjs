/**
 * Deploy GAS Web App with proper WEB_APP entry point (clasp deploy alone may 404).
 * Usage: node gas/deploy-webapp.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT_ID = '1oUZ4XX3_WibcXT3MqHWYQdlxxTtvK9zaT9Lvf4Fhob9TuEUxIOJ_pwIN';
const DEPLOYMENT_ID = 'AKfycbwX1kHkyDJgwYiv9L1veCb8RdXZawswn-8MY8jmtfTCj1lFrYzR1-AwjpGB-A6AZzBv';

function readToken() {
  const rcPath = path.join(os.homedir(), '.clasprc.json');
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  const token = rc.tokens && rc.tokens.default && rc.tokens.default.access_token;
  if (!token) throw new Error('No clasp access token — run: clasp login');
  return token;
}

async function gasApi(token, method, apiPath, body) {
  const res = await fetch('https://script.googleapis.com/v1' + apiPath, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) throw new Error((data.error && data.error.message) || text || res.statusText);
  return data;
}

async function main() {
  const token = readToken();
  console.log('Creating script version...');
  const version = await gasApi(token, 'POST', '/projects/' + SCRIPT_ID + '/versions', {
    description: 'Web App deploy ' + new Date().toISOString()
  });
  const versionNumber = version.versionNumber;
  console.log('Version:', versionNumber);

  console.log('Creating deployment (webapp from manifest)...');
  const deployment = await gasApi(token, 'POST', '/projects/' + SCRIPT_ID + '/deployments', {
    versionNumber,
    manifestFileName: 'appsscript',
    description: 'DrugInventory Web App ' + new Date().toISOString()
  });

  const id = deployment.deploymentId;
  if (!id) throw new Error('No deploymentId returned');
  const url = 'https://script.google.com/macros/s/' + id + '/exec';
  console.log('\nDeployed Web App URL:\n' + url);
  console.log('\nTest: ' + url + '?action=ping');
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
