const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('backupp.db');

db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';", [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
  
  db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';", [], (err, indexRows) => {
    console.log(JSON.stringify(indexRows, null, 2));
  });
});
