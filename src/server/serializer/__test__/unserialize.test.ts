import unserialize from '../unserialize';

describe('unserialize module', () => {
  test('unserialize string', () => {
    expect(() => unserialize('"str'))
      .toThrow('Unserialize luadata failed on pos 4:\n    "str\n        ^\n    unexpected string ending: missing close quote.');
    expect(unserialize('"str"')).toBe('str');
    expect(unserialize('"\\"str"')).toBe('"str');
  });

  test('unserialize bool', () => {
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

  test('unserialize global variable', () => {
    expect(() => unserialize('True'))
      .toThrow('Unserialize luadata failed on pos 4:\n    True\n        ^\n    attempt to refer a non-exists global variable.');
    expect(() => unserialize('true1'))
      .toThrow('Unserialize luadata failed on pos 5:\n    rue1\n        ^\n    attempt to refer a non-exists global variable.');

    expect(unserialize('a', { global: { a: 1 } })).toBe(1);
    expect(unserialize('a.b', { global: { a: { b: 1 } } })).toBe(1);
    expect(unserialize('a["b"].c', { global: { a: { b: { c: 1 } } } })).toBe(1);
    expect(unserialize('a[1]', { global: { a: new Map<unknown, unknown>([[1, 1], ['a', 2]]) } })).toBe(1);
    expect(unserialize('a[1]', { global: { a: [1] } })).toBe(1);
    expect(unserialize('a["a"]', { global: { a: [1] } })).toBe(void 0);
    expect(unserialize('a["a" ]', { global: { a: [1] } })).toBe(void 0);
    expect(unserialize('a["a"--[[comment]]]', { global: { a: [1] } })).toBe(void 0);
    expect(unserialize('a.a', { global: { a: [1] } })).toBe(void 0);
    expect(unserialize('a[LETTER.LOWER_B]', { global: { a: { b: 1 }, LETTER: { LOWER_B: 'b' } } })).toBe(1);
    expect(unserialize('a.b', { global: { a: new Map([['b', 1]]) } })).toBe(1);
    expect(unserialize('a.b', { global: new Map([['a', new Map([['b', 1]])]]) })).toBe(1);
    expect(unserialize('a.b', { global: { a: { b: { c: 1 } } } })).toEqual(new Map([['c', 1]]));
    expect(unserialize('a.b', { global: { a: { b: { c: [1] } } }, dictType: 'object' })).toEqual({ c: [1] });

    expect(() => unserialize('a.b["c"]', { global: { a: { b: 1 } } }))
      .toThrow('Unserialize luadata failed on pos 7:\n    ["c"]\n        ^\n    attempt to index a non-table value.');
    expect(() => unserialize('a["b"', { global: { a: { b: 1 } } }))
      .toThrow('Unserialize luadata failed on pos 5:\n    ["b"\n        ^\n    unexpected end of table key expression, "]" expected.');
    expect(() => unserialize('a["b"?', { global: { a: { b: 1 } } }))
      .toThrow('Unserialize luadata failed on pos 5:\n    ["b"?\n        ^\n    unexpected character, "]" expected.');
    expect(() => unserialize('a.?', { global: { a: { b: 1 } } }))
      .toThrow('Unserialize luadata failed on pos 2:\n    a.?\n      ^\n    unexpected character, variable name expected.');

    expect(() => unserialize('_G.math.pi', { global: { _G: {} } }))
      .toThrow('Unserialize luadata failed on pos 10:\n    h.pi\n        ^\n    attempt to index a non-table value.');
    expect(unserialize('_G.math.pi')).toBe(Math.PI);
    expect(unserialize('_G.a.b', { global: new Map([['a', new Map([['b', 1]])]]) })).toBe(1);
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
      .toThrow('Unserialize luadata failed on pos 3:\n    {1}}\n       ^\n    unexpected character.');
    expect(() => unserialize('{1,,}'))
      .toThrow('Unserialize luadata failed on pos 3:\n    {1,,}\n       ^\n    unexpected empty value.');
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
    expect(() => unserialize('{[2'))
      .toThrow('Unserialize luadata failed on pos 3:\n    {[2\n       ^\n    unexpected end of table key expression, "]" expected.');
    expect(() => unserialize('{[2 ?]=1}'))
      .toThrow('Unserialize luadata failed on pos 4:\n    {[2 ?]=1}\n        ^\n    unexpected character, "]" expected.');
    expect(() => unserialize('{[2]$=1}'))
      .toThrow('Unserialize luadata failed on pos 4:\n    {[2]$=1}\n        ^\n    unexpected character, "=" expected.');
    expect(() => unserialize('{[2]=1$}'))
      .toThrow('Unserialize luadata failed on pos 6:\n    2]=1$}\n        ^\n    unexpected character.');
    expect(unserialize('{1,2,["3"]="3",a=1}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3'], ['a', 1]]));
    expect(unserialize('{1,2,["3"]="3",a=1}', { dictType: 'object' })).toEqual({ 1: 1, 2: 2, 3: '3', a: 1 });
    expect(unserialize('{1,2,["3"]="3",a =1}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3'], ['a', 1]]));
    expect(unserialize('{1,2,["3"]="3",a--[[comment]]=1}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3'], ['a', 1]]));
    expect(unserialize('{1,2,["3"]="3",["a"]--[[comment]]=1}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3'], ['a', 1]]));
    expect(unserialize('{1,2,["3"]="3",["a"--[[comment]]]=1}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], ['3', '3'], ['a', 1]]));
    expect(unserialize('{1,2,["3"]="3",true}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], [3, true], ['3', '3']]));
    expect(unserialize('{1,2,["3"]="3",3,["4"]="4"}')).toEqual(new Map<unknown, unknown>([[1, 1], [2, 2], [3, 3], ['3', '3'], ['4', '4']]));
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
    expect(unserialize(' -- comment\n{1}')).toEqual([1]);
  });

  test('unserialize with multiline comment', () => {
    expect(() => unserialize('{ --[[comment\n1}'))
      .toThrow('Unserialize luadata failed on pos 16:\n    t\\n1}\n        ^\n    unexpected end of multiline comment, "]]" expected.');
    expect(unserialize(' --[[comment]]{1}')).toEqual([1]);
    expect(unserialize('{ --[[comment]]1}')).toEqual([1]);
    expect(unserialize('{ --[[comment\n ]]\n1}')).toEqual([1]);
    expect(unserialize('{1--[[comment]]}')).toEqual([1]);
    expect(unserialize('{1,--[[comment]]}')).toEqual([1]);
    expect(unserialize('{[--[[comment]]1]=1}')).toEqual([1]);
  });
});
