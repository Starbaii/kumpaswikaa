
const { labelText } = require('./labels');

function buildSentence(labels, language) {
  const words = [];
  let spelling = '';
  for (const label of labels) {
    const text = labelText(label, language);
    if (String(label).length === 1) {
      spelling += text;
    } else {
      if (spelling) {
        words.push(spelling);
        spelling = '';
      }
      words.push(text);
    }
  }
  if (spelling) words.push(spelling);
  return words.join(' ');
}

module.exports = { buildSentence };
