const https = require('https');
require('dotenv').config();

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_API_KEY not found in environment variables');
  process.exit(1);
}

console.log('🔑 API Key loaded:', apiKey.substring(0, 10) + '...');

// 基本的なGemini APIテスト（REST）
async function testBasicGemini() {
  console.log('🚀 Testing basic Gemini API...');
  
  const data = JSON.stringify({
    contents: [{
      parts: [{
        text: "Hello! Please respond with a simple greeting to confirm the API is working."
      }]
    }]
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (response.candidates && response.candidates[0]) {
            const text = response.candidates[0].content.parts[0].text;
            console.log('✅ API Response:', text);
            resolve(text);
          } else {
            console.error('❌ Unexpected response format:', response);
            reject(new Error('Unexpected response format'));
          }
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          console.error('Raw response:', responseData);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

testBasicGemini()
  .then(() => {
    console.log('🎉 Basic Gemini API test completed successfully!');
  })
  .catch((error) => {
    console.error('💥 Basic Gemini API test failed:', error);
  }); 