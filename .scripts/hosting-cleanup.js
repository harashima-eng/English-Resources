#!/usr/bin/env node
/* Firebase Hosting Version Cleanup
   Deletes old hosting versions, keeping only the N most recent.
   Usage: node hosting-cleanup.js [keepCount]
   Default keepCount: 5 */

var https = require('https');
var fs = require('fs');
var path = require('path');
var os = require('os');

var SITE = 'english-resources-reveal';
var keepCount = parseInt(process.argv[2]) || 5;

function apiRequest(method, apiPath, token) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'firebasehosting.googleapis.com',
      path: '/v1beta1/' + apiPath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function refreshAccessToken(refreshToken) {
  return new Promise(function(resolve, reject) {
    var postData = [
      'grant_type=refresh_token',
      'refresh_token=' + encodeURIComponent(refreshToken),
      'client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      'client_secret=j9iVZfS8kkCEFUPaAeJV0sAi'
    ].join('&');

    var options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error('No access_token in response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function getAccessToken() {
  // Read firebase-tools config for refresh token
  var configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  try {
    var configRaw = fs.readFileSync(configPath, 'utf8');
    var config = JSON.parse(configRaw);
    if (config.tokens && config.tokens.refresh_token) {
      return await refreshAccessToken(config.tokens.refresh_token);
    }
  } catch (e) {
    console.error('[hosting-cleanup] Could not read firebase config:', e.message);
  }
  return null;
}

async function cleanup() {
  var token = await getAccessToken();
  if (!token) {
    console.error('[hosting-cleanup] Could not obtain access token. Run: firebase login');
    process.exit(1);
  }

  console.log('[hosting-cleanup] Listing versions for ' + SITE + '...');

  try {
    var result = await apiRequest(
      'GET',
      'sites/' + SITE + '/versions?pageSize=100&filter=status="FINALIZED"',
      token
    );

    var versions = result.versions || [];
    if (versions.length <= keepCount) {
      console.log('[hosting-cleanup] Only ' + versions.length + ' versions found. Nothing to delete.');
      return;
    }

    // Sort by createTime descending (newest first)
    versions.sort(function(a, b) {
      return new Date(b.createTime) - new Date(a.createTime);
    });

    var toDelete = versions.slice(keepCount);
    console.log('[hosting-cleanup] Keeping ' + keepCount + ', deleting ' + toDelete.length + ' old versions...');

    var deleted = 0;
    for (var i = 0; i < toDelete.length; i++) {
      var versionName = toDelete[i].name;
      try {
        await apiRequest('DELETE', versionName, token);
        deleted++;
      } catch (e) {
        // Some versions may be pinned or undeletable
        if (i < 3) console.warn('[hosting-cleanup] Could not delete ' + versionName + ': ' + e.message);
      }
    }

    console.log('[hosting-cleanup] Done. Deleted ' + deleted + ' / ' + toDelete.length + ' old versions.');
  } catch (e) {
    console.error('[hosting-cleanup] Error: ' + e.message);
    process.exit(1);
  }
}

cleanup();
