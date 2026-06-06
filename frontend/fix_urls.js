const fs = require('fs');

const nativeLogicModal = `  const getNativeLink = () => {
    if (!client.subId && !client.email) return 'No Sub ID available';
    const sub = client.subId || client.email;
    if (client.inbound?.panel?.subUrl) return \`\${client.inbound.panel.subUrl}\${sub}\`;
    if (client.inbound?.panel?.url) return \`\${client.inbound.panel.url}/sub/\${sub}\`;
    return \`\${typeof window !== 'undefined' ? window.location.origin : ''}/sub/\${sub}\`;
  };`;

const nativeLogicTheme = `  const getNativeUrl = () => {
    const sub = subId || email;
    if (inbound?.panel?.subUrl) return \`\${inbound.panel.subUrl}\${sub}\`;
    if (inbound?.panel?.url) return \`\${inbound.panel.url}/sub/\${sub}\`;
    return \`\${typeof window !== 'undefined' ? window.location.origin : ''}/sub/\${sub}\`;
  };`;

function replaceLogic(filePath, isModal) {
    let content = fs.readFileSync(filePath, 'utf8');
    const regex = isModal 
      ? /const getNativeLink = \(\) => \{[\s\S]*?\n  \};/
      : /const getNativeUrl = \(\) => \{[\s\S]*?\n  \};/;
      
    content = content.replace(regex, isModal ? nativeLogicModal : nativeLogicTheme);
    fs.writeFileSync(filePath, content);
}

replaceLogic('src/components/ConnectionDetailsModal.tsx', true);
replaceLogic('src/app/s/[id]/themes/DefaultTheme.tsx', false);
replaceLogic('src/app/s/[id]/themes/SunsetTheme.tsx', false);
replaceLogic('src/app/s/[id]/themes/HackerTheme.tsx', false);
replaceLogic('src/app/s/[id]/themes/MinimalistTheme.tsx', false);
replaceLogic('src/app/s/[id]/themes/CyberpunkTheme.tsx', false);
