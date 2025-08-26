const test = require('node:test');
const assert = require('node:assert/strict');

test('trims whitespace and removes blank entries', async () => {
  const { parseItems } = await import('../recipes.js');
  const raw = '  apple  \n  \n banana   \n';
  assert.deepStrictEqual(parseItems(raw), ['apple', 'banana']);
});

test('splits by commas or newlines', async () => {
  const { parseItems } = await import('../recipes.js');
  const raw = 'apple,banana\ncarrot';
  assert.deepStrictEqual(parseItems(raw), ['apple', 'banana', 'carrot']);
});

test('deduplicates repeated ingredients', async () => {
  const { parseItems } = await import('../recipes.js');
  const raw = 'apple, banana\napple, banana';
  assert.deepStrictEqual(parseItems(raw), ['apple', 'banana']);
});
