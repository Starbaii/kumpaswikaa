

const DISPLAY_NAMES = {
  I_Love_You: 'I Love You',
  Thank_You: 'Thank You',
  Good_Morning: 'Good Morning',
  Good_Afternoon: 'Good Afternoon',
  Good_Night: 'Good Night',
};

const TAGALOG = {
  I_Love_You: 'Mahal kita',
  Thank_You: 'Salamat po',
  Good_Morning: 'Magandang umaga',
  Good_Afternoon: 'Magandang hapon',
  Good_Night: 'Magandang gabi',
};

function englishText(label) {
  return DISPLAY_NAMES[label] || String(label).replace(/_/g, ' ');
}

function labelText(label, language) {
  if (language === 'tagalog') return TAGALOG[label] || englishText(label);
  return englishText(label);
}

module.exports = { labelText, englishText };
