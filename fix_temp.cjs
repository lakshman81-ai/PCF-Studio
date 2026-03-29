const fs = require('fs');
const content = fs.readFileSync('js/ray-concept/rc-stage3-ray-engine.js', 'utf8');
console.log(content.split('function runPass1B')[0].split('function runPass1A')[1]);
