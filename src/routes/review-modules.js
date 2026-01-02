/**
 * @fileoverview Code quality review script for refactored route modules.
 * Checks for:
 * - Proper exports
 * - JSDoc documentation
 * - Console.log statements (excluding expected error logging)
 * - Code style consistency
 */

const fs = require('fs');
const path = require('path');

const moduleDirs = [
  './depthCharts',
  './teams',
  './reports',
  './settings'
];

const reExportFiles = [
  './depthCharts.js',
  './teams.js',
  './reports.js',
  './settings.js'
];

const issues = {
  missingExports: [],
  missingJSDoc: [],
  unexpectedConsoleLogs: [],
  styleIssues: []
};

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const relPath = path.relative(process.cwd(), filePath);

  console.log(`\nChecking: ${relPath}`);

  // Check 1: Proper exports
  if (!content.includes('module.exports')) {
    issues.missingExports.push(relPath);
    console.log('  ❌ Missing module.exports');
  } else {
    console.log('  ✅ Has module.exports');
  }

  // Check 2: JSDoc comments
  if (!content.includes('/**') || !content.includes('@fileoverview')) {
    issues.missingJSDoc.push(relPath);
    console.log('  ❌ Missing or incomplete JSDoc');
  } else {
    console.log('  ✅ Has JSDoc documentation');
  }

  // Check 3: Console.log statements (excluding console.error and console.warn in error handling)
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    // Allow console.error and console.warn in error handling
    if (line.includes('console.log') ||
        (line.includes('console.') && !line.includes('console.error') && !line.includes('console.warn'))) {
      issues.unexpectedConsoleLogs.push(`${relPath}:${index + 1}`);
    }
  });

  // Check 4: Basic style consistency
  const hasInconsistentIndentation = content.split('\n').some(line => {
    // Check for tabs (we should use spaces)
    return line.match(/^\t/);
  });

  if (hasInconsistentIndentation) {
    issues.styleIssues.push(`${relPath}: Tab characters found (should use spaces)`);
    console.log('  ⚠️  Tab characters found');
  } else {
    console.log('  ✅ Consistent indentation');
  }
}

console.log('='.repeat(80));
console.log('CODE QUALITY REVIEW - Refactored Route Modules');
console.log('='.repeat(80));

// Check all module directories
moduleDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    console.log(`\n⚠️  Directory not found: ${dir}`);
    return;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));

  console.log(`\n${'='.repeat(80)}`);
  console.log(`${dir.toUpperCase()} MODULE`);
  console.log('='.repeat(80));

  files.forEach(file => {
    checkFile(path.join(dirPath, file));
  });
});

// Check re-export files
console.log(`\n${'='.repeat(80)}`);
console.log('RE-EXPORT FILES');
console.log('='.repeat(80));

reExportFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    checkFile(filePath);
  } else {
    console.log(`\n⚠️  File not found: ${file}`);
  }
});

// Print summary
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

if (issues.missingExports.length > 0) {
  console.log(`\n❌ Files missing module.exports (${issues.missingExports.length}):`);
  issues.missingExports.forEach(f => console.log(`   - ${f}`));
}

if (issues.missingJSDoc.length > 0) {
  console.log(`\n❌ Files missing JSDoc (${issues.missingJSDoc.length}):`);
  issues.missingJSDoc.forEach(f => console.log(`   - ${f}`));
}

if (issues.unexpectedConsoleLogs.length > 0) {
  console.log(`\n⚠️  Unexpected console statements (${issues.unexpectedConsoleLogs.length}):`);
  issues.unexpectedConsoleLogs.forEach(f => console.log(`   - ${f}`));
}

if (issues.styleIssues.length > 0) {
  console.log(`\n⚠️  Style issues (${issues.styleIssues.length}):`);
  issues.styleIssues.forEach(f => console.log(`   - ${f}`));
}

const totalIssues = issues.missingExports.length +
                    issues.missingJSDoc.length +
                    issues.unexpectedConsoleLogs.length +
                    issues.styleIssues.length;

console.log('\n' + '='.repeat(80));
if (totalIssues === 0) {
  console.log('✅ ALL CHECKS PASSED!');
  console.log('All modules have proper exports, JSDoc documentation, and consistent style.');
} else {
  console.log(`⚠️  FOUND ${totalIssues} ISSUE(S)`);
  console.log('Please review and fix the issues listed above.');
}
console.log('='.repeat(80) + '\n');

process.exit(totalIssues > 0 ? 1 : 0);
