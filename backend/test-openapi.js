const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });
const token = "qZp5gNn3iH27MhRBupjmtzdiZhkGL1uH16ANPnW81XdhOk0R";
const baseURL = "https://162.217.248.30:2053/ZoQN9vs5UzcgZ9TY0c/panel/api";

async function fetchOpenApi() {
  try {
    const res = await axios.get(`${baseURL}/openapi.json`, { 
      httpsAgent: agent,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const paths = Object.keys(res.data.paths);
    const groupPaths = paths.filter(p => p.toLowerCase().includes('group') || p.toLowerCase().includes('node') || p.toLowerCase().includes('reseller') || p.toLowerCase().includes('client'));
    console.log("Found Paths:");
    console.log(groupPaths);
  } catch (err) {
    console.error("Failed to fetch openapi.json:", err.message);
  }
}

fetchOpenApi();
