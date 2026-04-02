
const fs = require('fs');
const ts = require('typescript');

const filePath = 'd:/Work/Fabulous-Future-UI/server/routes.ts';
const fileContent = fs.readFileSync(filePath, 'utf8');

const result = ts.transpileModule(fileContent, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS }
});

if (result.diagnostics.length > 0) {
    console.log('Found errors:');
    result.diagnostics.forEach(diag => {
        const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
        if (diag.file) {
            const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
            console.log(`${diag.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
            console.log(message);
        }
    });
} else {
    console.log('No syntax errors found.');
}
