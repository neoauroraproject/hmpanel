const fs = require('fs');

let c = fs.readFileSync('src/app/(app)/dashboard/page.tsx', 'utf8');

c = c.replace(/formatter=\{\(val\) => \[formatBytes\(Number\(val\)\}, \"Traffic\"\]\}/g, 'formatter={(val) => [formatBytes(Number(val)), "Traffic"]}');
c = c.replace(/formatter=\{\(val\) => \[formatBytes\(Number\(val\)\}, \"Usage\"\]\}/g, 'formatter={(val) => [formatBytes(Number(val)), "Usage"]}');
c = c.replace(/tickFormatter=\{\(v\) => formatBytes\(v\)\}/g, 'tickFormatter={(v) => formatBytes(Number(v))}');
// Just in case the previous replacement got mangled:
c = c.replace(/formatter=\{\(val\) => \[formatBytes\(val\), "Traffic"\]\}/g, 'formatter={(val) => [formatBytes(Number(val)), "Traffic"]}');
c = c.replace(/formatter=\{\(val\) => \[formatBytes\(val\), "Usage"\]\}/g, 'formatter={(val) => [formatBytes(Number(val)), "Usage"]}');


fs.writeFileSync('src/app/(app)/dashboard/page.tsx', c);
