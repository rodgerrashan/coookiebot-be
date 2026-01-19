const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

/**
 * Compiles an HTML template with dynamic data
 * @param {string} templateName - Name of the file in /templates
 * @param {object} data - The variables to inject (otp, email, etc.)
 */
const getCompiledHtml = (templateName, data) => {
  const filePath = path.join(__dirname, 'templates', `${templateName}.html`);
  const source = fs.readFileSync(filePath, 'utf-8');
  const template = handlebars.compile(source);
  return template(data);
};


exports.getCompiledHtml = getCompiledHtml;

// Example Usage:
// const htmlToSend = getCompiledHtml('verify-email', {
//   email: 'user@example.com',
//   otp: '123456'
// });