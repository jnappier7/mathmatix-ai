// utils/postprocess.js

function extractGraphTag(text) {
  const match = text.match(/\[GRAPH:\s*(.*?)\]/i);
  return match ? match[1].trim() : null;
}

function extractImagePrompt(text) {
  const match = text.match(/\[IMAGE:\s*(.*?)\]/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  extractGraphTag,
  extractImagePrompt
};
// JavaScript Document