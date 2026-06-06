const fs = require('fs');
const path = 'src/app/(app)/clients/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/qc\.invalidateQueries\(\{ queryKey: \["clients"\] \}\);/g, 'qc.invalidateQueries({ queryKey: ["clients"] });\n      qc.invalidateQueries({ queryKey: ["reseller-overview"] });\n      qc.invalidateQueries({ queryKey: ["overview"] });');

fs.writeFileSync(path, content);
console.log('Patched clients page mutations');
