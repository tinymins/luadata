import serialize from '../serialize';

describe('sum module', () => {
  test('serialize null to luadata', () => {
    expect(serialize(null)).toBe('nil');
  });

  test('serialize undefined to luadata', () => {
    expect(serialize(void 0)).toBe('nil');
  });

  test('serialize number to luadata', () => {
    expect(serialize(1)).toBe('1');
  });

  test('serialize string to luadata', () => {
    expect(serialize('str')).toBe('"str"');
  });

  test('serialize boolean to luadata', () => {
    expect(serialize(true)).toBe('true');
    expect(serialize(false)).toBe('false');
  });

  test('serialize number to luadata', () => {
    expect(serialize(0.1)).toBe('0.1');
    expect(serialize(100)).toBe('100');
  });

  test('serialize array to luadata', () => {
    expect(serialize([])).toBe('{}');
    expect(serialize([1])).toBe('{1}');
    expect(serialize([1, 0.2, '3', true])).toBe('{1,0.2,"3",true}');
  });

  test('serialize array to luadata with indent', () => {
    expect(serialize([], { indent: '  ' })).toBe('{}');
    expect(serialize([1, 2, '3'], { indent: '  ' })).toBe('{\n  1,\n  2,\n  "3",\n}');
  });

  test('serialize nested array to luadata', () => {
    expect(serialize([1, 2, '3', [4]])).toBe('{1,2,"3",{4}}');
  });

  test('serialize nested array to luadata with indent', () => {
    expect(serialize([1, 2, '3', [4]], { indent: '  ' })).toBe('{\n  1,\n  2,\n  "3",\n  {\n    4,\n  },\n}');
  });

  test('serialize object to luadata', () => {
    expect(serialize({ a: 1, 3: '3' })).toBeOneOf([
      '{a=1,["3"]="3"}',
      '{["3"]="3",a=1}',
    ]);
  });

  test('serialize nested object to luadata', () => {
    expect(serialize({ a: 1, 3: { a: '3' } })).toBeOneOf([
      '{a=1,["3"]={a="3"}}',
      '{["3"]={a="3"},a=1}',
    ]);
  });

  test('serialize object to luadata with indent', () => {
    expect(serialize({ a: 1, 3: '3' }, { indent: '  ' })).toBeOneOf([
      '{\n  a = 1,\n  ["3"] = "3",\n}',
      '{\n  ["3"] = "3",\n  a = 1,\n}',
    ]);
  });

  test('serialize object to luadata with indentLevel', () => {
    expect(serialize({ a: 1, 3: '3' }, { indent: '  ', indentLevel: 1 })).toBeOneOf([
      '{\n    a = 1,\n    ["3"] = "3",\n  }',
      '{\n    ["3"] = "3",\n    a = 1,\n  }',
    ]);
  });

  test('serialize map to luadata', () => {
    const map = new Map();
    expect(serialize(map)).toBe('{}');
    map.set(1, 1);
    map.set(2, 2);
    map.set('3', '3');
    expect(serialize(map)).toBe('{1,2,["3"]="3"}');
  });

  test('serialize nested map to luadata', () => {
    const map = new Map();
    map.set(1, 1);
    map.set(2, 2);
    map.set('3', new Map([[3, '3']]));
    expect(serialize(map)).toBe('{1,2,["3"]={[3]="3"}}');
  });

  test('serialize map to luadata with indent', () => {
    const map = new Map();
    map.set(1, 1);
    map.set(2, 2);
    map.set('3', '3');
    expect(serialize(map, { indent: '  ' })).toBe('{\n  1,\n  2,\n  ["3"] = "3",\n}');
  });

  test('serialize nested map to luadata with indent', () => {
    const map = new Map();
    map.set(1, 1);
    map.set(2, 2);
    map.set('3', new Map([[3, '3']]));
    expect(serialize(map, { indent: '  ' })).toBe('{\n  1,\n  2,\n  ["3"] = {\n    [3] = "3",\n  },\n}');
  });

  test('serialize tuple to luadata', () => {
    expect(serialize([1, 2, { a: 1 }], { tuple: true })).toBe('1,2,{a=1}');
  });

  test('serialize tuple to luadata with indent', () => {
    expect(serialize([1, 2, { a: 1 }], { tuple: true, indent: '  ' })).toBe('1,\n2,\n{\n  a = 1,\n}');
  });
});
