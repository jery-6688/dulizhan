const fs = require('fs');
const path = require('path');

const files = [
  'product-detail.html',
  'support.html',
  'solutions.html',
  'certifications.html',
  'contact.html',
  'factory.html',
  'oem-odm.html',
  'products.html',
  'about.html'
];

function findClosingTag(html, startIndex, tagName) {
  const openTagRegex = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closeTagRegex = new RegExp(`</${tagName}>`, 'gi');
  
  let depth = 0;
  let pos = startIndex;
  
  openTagRegex.lastIndex = startIndex;
  let firstMatch = openTagRegex.exec(html);
  if (!firstMatch || firstMatch.index !== startIndex) {
    return -1;
  }
  depth = 1;
  pos = firstMatch.index + firstMatch[0].length;
  
  while (depth > 0 && pos < html.length) {
    openTagRegex.lastIndex = pos;
    closeTagRegex.lastIndex = pos;
    
    const nextOpen = openTagRegex.exec(html);
    const nextClose = closeTagRegex.exec(html);
    
    if (!nextClose) break;
    
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      pos = nextClose.index + nextClose[0].length;
      if (depth === 0) {
        return pos;
      }
    }
  }
  
  return -1;
}

function findDivWithId(html, id) {
  const startPattern = new RegExp(`<div[^>]*id="${id}"[^>]*>`, 'gi');
  const match = startPattern.exec(html);
  if (!match) return null;
  
  const startIndex = match.index;
  const endIndex = findClosingTag(html, startIndex, 'div');
  if (endIndex === -1) return null;
  
  return { start: startIndex, end: endIndex };
}

function findTagRange(html, tagName, startFrom = 0) {
  const startPattern = new RegExp(`<${tagName}[\\s>]`, 'i');
  const match = startPattern.exec(html.substring(startFrom));
  if (!match) return null;
  
  const startIndex = startFrom + match.index;
  const endIndex = findClosingTag(html, startIndex, tagName);
  if (endIndex === -1) return null;
  
  return { start: startIndex, end: endIndex };
}

function findFloatingButtonsRange(html) {
  const commentIndex = html.indexOf('<!-- Floating buttons -->');
  if (commentIndex === -1) return null;
  
  const divStart = html.indexOf('<div', commentIndex);
  if (divStart === -1) return null;
  
  const endIndex = findClosingTag(html, divStart, 'div');
  if (endIndex === -1) return null;
  
  return { start: commentIndex, end: endIndex };
}

function processFile(filePath) {
  console.log(`Processing: ${path.basename(filePath)}`);
  
  let html = fs.readFileSync(filePath, 'utf8');
  let modifications = [];
  
  const headerRange = findTagRange(html, 'header');
  if (headerRange) {
    const drawerRange = findDivWithId(html.substring(headerRange.end), 'drawer');
    if (drawerRange) {
      const totalStart = headerRange.start;
      const totalEnd = headerRange.end + drawerRange.end;
      const replacement = '\n<!-- Shared Header (rendered by main.js) -->\n<div id="site-header"></div>\n';
      html = html.substring(0, totalStart) + replacement + html.substring(totalEnd);
      modifications.push('Header + Mobile Drawer');
    } else {
      console.log(`  Warning: Mobile Drawer not found after header`);
    }
  } else {
    console.log(`  Warning: Header not found`);
  }
  
  const footerRange = findTagRange(html, 'footer');
  if (footerRange) {
    const replacement = '\n<!-- Shared Footer (rendered by main.js) -->\n<div id="site-footer"></div>\n';
    html = html.substring(0, footerRange.start) + replacement + html.substring(footerRange.end);
    modifications.push('Footer');
  } else {
    console.log(`  Warning: Footer not found`);
  }
  
  const floatingRange = findFloatingButtonsRange(html);
  if (floatingRange) {
    const replacement = '<!-- Shared Floating Buttons (rendered by main.js) -->\n<div id="site-floating-buttons"></div>';
    html = html.substring(0, floatingRange.start) + replacement + html.substring(floatingRange.end);
    modifications.push('Floating Buttons');
  } else {
    console.log(`  Warning: Floating Buttons not found`);
  }
  
  if (modifications.length > 0) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`  Modified: ${modifications.join(', ')}`);
    return true;
  } else {
    console.log(`  No modifications made`);
    return false;
  }
}

const baseDir = __dirname;
let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    if (processFile(filePath)) {
      modifiedCount++;
    }
  } else {
    console.log(`File not found: ${file}`);
  }
}

console.log(`\nDone! Modified ${modifiedCount} files.`);
