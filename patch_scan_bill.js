const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'scan-bill.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add missing styles before the last '});'
const styleMarker = "  modalBackdrop: {\n    flex: 1,\n    backgroundColor: 'rgba(15,23,42,0.65)',\n    alignItems: 'center',\n    justifyContent: 'center',\n  },";
const newStyles = `
  cameraFrameCenter: {
    height: 280,
    width: '85%',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  frameCornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#FFFFFF',
    borderTopLeftRadius: 16,
  },
  frameCornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#FFFFFF',
    borderTopRightRadius: 16,
  },
  frameCornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#FFFFFF',
    borderBottomLeftRadius: 16,
  },
  frameCornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#FFFFFF',
    borderBottomRightRadius: 16,
  },
  frameScanLine: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },`;

if (content.includes(styleMarker) && !content.includes("cameraFrameCenter:")) {
  content = content.replace(styleMarker, styleMarker + newStyles);
  console.log('Styles patched');
}

fs.writeFileSync(filePath, content);
console.log('Patch complete');
