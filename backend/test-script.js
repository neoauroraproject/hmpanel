const jwt = require('jsonwebtoken');
const axios = require('axios');
const token = jwt.sign({ id: 'test-id', role: 'RESELLER' }, process.env.JWT_SECRET || 'secret');
axios.get('http://localhost:3000/admins/test-id', {
  headers: { Authorization: `Bearer ${token}` }
}).then(res => console.log(res.data)).catch(err => console.log(err.response?.status, err.response?.data));
