const https = require('https');
const http = require('http');

// Configuration
const hostname = 'localhost';
const port = 3000;
const path = '/api/slots/migrate';

// Make the request
const options = {
  hostname: hostname,
  port: port,
  path: path,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('Migration result:', result);
      if (result.success) {
        console.log(`✅ Successfully migrated ${result.updatedCount} slots`);
      } else {
        console.log('❌ Migration failed:', result.error);
      }
    } catch (error) {
      console.log('❌ Failed to parse response:', error);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.end();

console.log('🔄 Starting slot migration...');
console.log(`📡 Calling ${hostname}:${port}${path}`); 