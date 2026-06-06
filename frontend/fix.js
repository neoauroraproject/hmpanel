const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('className="fixed inset-0') && lines[i+1] && lines[i+1].includes('onClick={')) {
      console.log('Found backdrop onClick in ' + filePath + ' line ' + (i+2));
      lines.splice(i+1, 1);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('Updated ' + filePath);
  }
}

['src/app/(app)/clients/page.tsx', 'src/app/(app)/admins/page.tsx', 'src/app/(app)/panels/page.tsx'].forEach(processFile);
