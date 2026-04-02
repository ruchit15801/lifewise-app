const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, 'server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf-8');

// 1. Add missing fields to the bill update route
const billUpdateMarker = "if (body.reminderDaysBefore !== undefined) update.reminderDaysBefore = body.reminderDaysBefore;";
const newFields = `
      if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
      if (body.imageKey !== undefined) update.imageKey = body.imageKey;
      if (body.vendorName !== undefined) update.vendorName = body.vendorName;
      if (body.billDate !== undefined) update.billDate = body.billDate;
      if (body.billNumber !== undefined) update.billNumber = body.billNumber;
      if (body.accountNumber !== undefined) update.accountNumber = body.accountNumber;
      if (body.source !== undefined) update.source = body.source;`;

if (content.includes(billUpdateMarker) && !content.includes("update.imageUrl = body.imageUrl;")) {
  content = content.replace(billUpdateMarker, billUpdateMarker + newFields);
  console.log('Bill update route patched');
} else {
  console.log('Bill update route already patched or marker not found');
}

fs.writeFileSync(routesPath, content);
console.log('Routes patching process complete');
