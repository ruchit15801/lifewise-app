const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, 'server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf-8');

// Add import
const importLine = "import { updateExistingOthers } from './categorization-utils';\n";
if (!content.includes("import { updateExistingOthers }")) {
  const line16Marker = "import { SystemSettingsSchema, type SystemSettings } from './db/system-settings-schema';";
  content = content.replace(line16Marker, line16Marker + "\n" + importLine);
}

// Add endpoint
const endpointHeader = "  app.post('/api/transactions/categorize-others', authMiddleware, async (req, res) => {\n" +
  "    try {\n" +
  "      const userId = (req as any).userId;\n" +
  "      const key = getOpenAIKey();\n" +
  "      if (!key) return res.status(500).json({ message: 'AI key not set' });\n" +
  "      const updated = await updateExistingOthers(userId, key);\n" +
  "      return res.json({ updated });\n" +
  "    } catch (err) {\n" +
  "      console.error('Categorize others error:', err);\n" +
  "      return res.status(500).json({ message: 'Server error.' });\n" +
  "    }\n" +
  "  });\n\n";

const syncMarker = "  // Sync transactions from SMS (app reads SMS, parses, sends here)";
if (content.includes(syncMarker) && !content.includes("/api/transactions/categorize-others")) {
  content = content.replace(syncMarker, endpointHeader + syncMarker);
}

fs.writeFileSync(routesPath, content);
console.log('Routes patched successfully');
