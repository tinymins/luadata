import unserialize from '../unserialize';

describe('unserialize module', () => {
  test('unserialize string', () => {
    expect(() => unserialize('"str'))
      .toThrow('Unserialize luadata failed on pos 4:\n    "str\n        ^\n    unexpected string ending: missing close quote.');
    expect(unserialize('"str"')).toBe('str');
  });

  test('unserialize bool', () => {
    expect(() => unserialize('True'))
      .toThrow('Unserialize luadata failed on pos 4:\n    True\n        ^\n    unexpected empty value.');
    expect(() => unserialize('true1'))
      .toThrow('Unserialize luadata failed on pos 4:\n    true1\n        ^\n    unexpected character.');
    expect(unserialize('true')).toBe(true);
    expect(unserialize('false')).toBe(false);
  });

  test('unserialize number', () => {
    expect(() => unserialize('1..'))
      .toThrow('Unserialize luadata failed on pos 2:\n    1..\n      ^\n    unexpected character.');
    expect(() => unserialize('..1'))
      .toThrow('Unserialize luadata failed on pos 1:\n    ..1\n     ^\n    unexpected dot.');
    expect(() => unserialize('1.1.'))
      .toThrow('Unserialize luadata failed on pos 3:\n    1.1.\n       ^\n    unexpected character.');
    expect(unserialize('.1')).toBe(0.1);
    expect(unserialize('0.1')).toBe(0.1);
    expect(unserialize('100')).toBe(100);
    expect(unserialize('100.')).toBe(100);
    expect(unserialize('-.1')).toBe(-0.1);
    expect(unserialize('-0.1')).toBe(-0.1);
    expect(unserialize('-100')).toBe(-100);
    expect(unserialize('-100.')).toBe(-100);
  });

  test('unserialize tuple', () => {
    expect(unserialize('1,2,3')).toBe(1);
    expect(unserialize('1', { tuple: true })).toEqual([1]);
    expect(unserialize('1,2,3', { tuple: true })).toEqual([1, 2, 3]);
  });

  test('unserialize array', () => {
    expect(() => unserialize('{1'))
      .toThrow('Unserialize luadata failed on pos 2:\n    {1\n      ^\n    unexpected end of table, "}" expected.');
    expect(() => unserialize('{1}}'))
      .toThrow('Unserialize luadata failed on pos 3:\n    {1}}\n       ^\n    unexpected table closing, no matching opening braces found.');
    expect(() => unserialize('{1,,}'))
      .toThrow('Unserialize luadata failed on pos 5:\n    1,,}\n        ^\n    unexpected empty value.');
    expect(unserialize('.1')).toBe(0.1);
    expect(unserialize('{}')).toEqual([]);
    expect(unserialize('{ }')).toEqual([]);
    expect(unserialize('{1}')).toEqual([1]);
    expect(unserialize('{1 }')).toEqual([1]);
    expect(unserialize('{ 1}')).toEqual([1]);
    expect(unserialize('{1,}')).toEqual([1]);
    expect(unserialize('{1, }')).toEqual([1]);
    expect(unserialize('{1 , }')).toEqual([1]);
  });

  test('unserialize array with multiple children', () => {
    expect(unserialize('{1,0.2,"3",-4,-.5,-6.,true}')).toEqual([1, 0.2, '3', -4, -0.5, -6, true]);
  });

  test('unserialize array with indent', () => {
    expect(unserialize('{\n  1,\n  2,\n  "3",\n}')).toEqual([1, 2, '3']);
  });

  test('unserialize nested array', () => {
    expect(unserialize('{1,2,"3",{4}}')).toEqual([1, 2, '3', [4]]);
  });

  test('unserialize nested array with indent', () => {
    expect(unserialize('{\n  1,\n  2,\n  "3",\n  {\n    4,\n  },\n}')).toEqual([1, 2, '3', [4]]);
  });

  test('unserialize dict', () => {
    expect(unserialize('{1,2,["3"]="3"}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3']]));
    expect(unserialize('{1,2,["3"]="3"}', { dictType: 'object' })).toEqual({ 1: 1, 2: 2, 3: '3' });
  });

  test('unserialize dict with indent', () => {
    expect(unserialize('{\n  1,\n  2,\n  ["3"] = "3",\n}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3']]));
  });

  test('unserialize nested dict', () => {
    expect(unserialize('{1,2,["3"]={[3]="3"}}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', new Map<unknown, unknown>([[3, '3']])]]));
    expect(unserialize('{1,2,["3"]={[3]="3"}}', { dictType: 'object' })).toEqual({ 1: 1, 2: 2, 3: { 3: '3' } });
  });

  test('unserialize nested dict with indent', () => {
    expect(unserialize('{\n  1,\n  2,\n  ["3"] = {\n    [3] = "3",\n  },\n}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', new Map<unknown, unknown>([[3, '3']])]]));
  });

  test('unserialize with inline comment', () => {
    expect(() => unserialize('{ -- comment 1}'))
      .toThrow('Unserialize luadata failed on pos 15:\n    t 1}\n        ^\n    unexpected end of table, "}" expected.');
    expect(unserialize('{ -- comment\n1}')).toEqual([1]);
  });

  test('unserialize with multiline comment', () => {
    expect(() => unserialize('{ --[[comment\n1}'))
      .toThrow('Unserialize luadata failed on pos 16:\n    t\\n1}\n        ^\n    unexpected end of table, "}" expected.');
    expect(unserialize('{ --[[comment]]1}')).toEqual([1]);
    expect(unserialize('{ --[[comment\n ]]\n1}')).toEqual([1]);
  });
});
