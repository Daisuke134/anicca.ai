import { SignJWT, importPKCS8 } from 'jose';

const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_VOIP_KEY = process.env.APNS_VOIP_KEY;
const APNS_TOPIC = process.env.APNS_TOPIC || 'com.anicca.app.voip';
const APNS_ENVIRONMENT = process.env.APNS_ENVIRONMENT || 'production';

const APNS_URL = APNS_ENVIRONMENT === 'development'
  ? 'https://api.sandbox.push.apple.com'
  : 'https://api.push.apple.com';

async function generateAPNsJWT() {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_VOIP_KEY) {
    throw new Error('APNs credentials not configured');
  }

  const key = APNS_VOIP_KEY.replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(key, 'ES256');

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APNS_KEY_ID })
    .setIssuedAt()
    .setIssuer(APNS_TEAM_ID)
    .setExpirationTime('1h')
    .sign(privateKey);

  return token;
}

export async function sendVoIPPush(deviceToken, payload) {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_VOIP_KEY) {
    console.error('APNs credentials not configured');
    return false;
  }

  try {
    const jwtToken = await generateAPNsJWT();
    const url = `${APNS_URL}/3/device/${deviceToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'apns-topic': APNS_TOPIC,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`APNs error: ${response.status} - ${errorText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending VoIP push:', error);
    return false;
  }
}

