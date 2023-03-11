interface UnserializeOptions {
  /**
   * returns tuple array for supporting multiple lua values likes "return 1, 2". Defaults to false.
   */
  tuple?: boolean;
  /**
   * show more verbose debug information. Defaults to false.
   */
  verbose?: boolean;
  /**
   * the container type for lua table, attention that due to javascript limitation `object` mode may cause table key type loss. Defaults to 'map'.
   */
  dictType?: 'object' | 'map';
}

interface Node {
  isRoot?: boolean;
  entries: [unknown, unknown][];
  luaLength: number;
}

interface State {
  state: 'SEEK_CHILD' | 'VALUE' | 'TEXT' | 'INT' | 'FLOAT' | 'VALUE_END' | 'KEY_EXPRESSION_OPEN' | 'KEY_EXPRESSION_FINISH' | 'KEY_EXPRESSION_CLOSE' | 'KEY_SIMPLE' | 'KEY_SIMPLE_END' | 'KEY_END';
  node: Node;
  key: unknown;
}

const print = (...v: unknown[]) => {
  console.debug(v.map(d => (typeof d === 'object' ? JSON.stringify(d) : String(d))).join(', '));
};

const sorter = (kv1: [unknown, unknown], kv2: [unknown, unknown]) => {
  const k1 = kv1[0];
  const k2 = kv2[0];
  if (typeof k1 === 'number' && typeof k2 === 'number') {
    return k1 - k2;
  }
  if (typeof k1 === 'number') {
    return -1;
  }
  if (typeof k2 === 'number') {
    return 1;
  }
  return String(k1).localeCompare(String(k2));
};

const nodeEntriesAppend = (node: Node, key: unknown, val: unknown) => {
  node.entries.push([key, val]);
  node.entries.sort(sorter);
  let luaLength = 0;
  for (let index = 0; index < node.entries.length; index++) {
    const kv = node.entries[index];
    if (kv[0] === luaLength + 1) {
      luaLength += 1;
    }
  }
  node.luaLength = luaLength;
};

const nodeToTable = (node: Node, dictType: UnserializeOptions['dictType']): unknown[] | Map<unknown, unknown> | Record<string, unknown> | null => {
  if (node.entries.length === node.luaLength) {
    const lst = [];
    for (let index = 0; index < node.entries.length; index++) {
      const kv = node.entries[index];
      lst.push(kv[1]);
    }
    return lst;
  } if (dictType === 'map') {
    const dct = new Map();
    for (let index = 0; index < node.entries.length; index++) {
      const kv = node.entries[index];
      dct.set(kv[0], kv[1]);
    }
    return dct;
  } if (dictType === 'object') {
    const rec: Record<string, unknown> = {};
    for (let index = 0; index < node.entries.length; index++) {
      const kv = node.entries[index];
      rec[String(kv[0])] = kv[1];
    }
    return rec;
  }
  return null;
};

const unserialize = <T = unknown>(raw: string, { tuple, verbose, dictType = 'map' }: UnserializeOptions = {}): T => {
  const rawBin = raw;
  const root: Node = { entries: [], luaLength: 0, isRoot: true };
  let node = root;
  const stack: State[] = [];
  let state: State['state'] = 'SEEK_CHILD';
  let pos = 0;
  let pos1 = 0;
  const rawBinLength = rawBin.length;
  let byteQuotingChar = '';
  let key: unknown = '';
  let data: unknown = '';
  let escaping = false;
  let comment = '';
  let componentName = '';
  let errmsg = '';

  while (pos <= rawBinLength) {
    let byteCurrent = '';
    let byteCurrentIsSpace = false;
    if (pos < rawBinLength) {
      byteCurrent = rawBin.slice(pos, pos + 1);
      byteCurrentIsSpace = byteCurrent === ' '
            || byteCurrent === '\r'
            || byteCurrent === '\n'
            || byteCurrent === '\t';
    }
    if (verbose) {
      print('[step] pos', pos, byteCurrent, state, comment, key, node);
    }

    if (comment === 'MULTILINE') {
      if (byteCurrent === ']' && rawBin.slice(pos, pos + 2) === ']]') {
        comment = '';
        pos += 1;
      }
    } else if (comment === 'INLINE') {
      if (byteCurrent === '\n') {
        comment = '';
      }
    } else if (state === 'SEEK_CHILD') {
      if (byteCurrent === '') {
        break;
      }
      if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (!node.isRoot && (
        (byteCurrent >= 'A' && byteCurrent <= 'Z')
            || (byteCurrent >= 'a' && byteCurrent <= 'z')
            || byteCurrent === '_'
      )) {
        state = 'KEY_SIMPLE';
        pos1 = pos;
      } else if (!node.isRoot && byteCurrent === '[') {
        state = 'KEY_EXPRESSION_OPEN';
      } else if (byteCurrent === '}') {
        const prevState = stack.pop();
        if (!prevState) {
          errmsg = 'unexpected table closing, no matching opening braces found.';
          break;
        }
        if (prevState.state === 'KEY_EXPRESSION_OPEN') {
          key = nodeToTable(node, dictType);
          state = 'KEY_END';
        } else if (prevState.state === 'VALUE') {
          nodeEntriesAppend(
            prevState.node,
            prevState.key,
            nodeToTable(node, dictType),
          );
          state = 'VALUE_END';
          key = '';
        }
        node = prevState.node;
      } else if (!byteCurrentIsSpace) {
        key = node.luaLength + 1;
        state = 'VALUE';
        pos -= 1;
      }
    } else if (state === 'VALUE') {
      if (byteCurrent === '') {
        errmsg = 'unexpected empty value.';
        break;
      }
      if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (byteCurrent === '"' || byteCurrent === "'") {
        state = 'TEXT';
        componentName = 'VALUE';
        pos1 = pos + 1;
        byteQuotingChar = byteCurrent;
      } else if (byteCurrent === '-' || (
        byteCurrent >= '0' && byteCurrent <= '9'
      )) {
        state = 'INT';
        componentName = 'VALUE';
        pos1 = pos;
      } else if (byteCurrent === '.') {
        state = 'FLOAT';
        componentName = 'VALUE';
        pos1 = pos;
      } else if (byteCurrent === 't' && rawBin.slice(pos, pos + 4) === 'true') {
        nodeEntriesAppend(node, key, true);
        state = 'VALUE_END';
        key = '';
        pos += 3;
      } else if (byteCurrent === 'f' && rawBin.slice(pos, pos + 5) === 'false') {
        nodeEntriesAppend(node, key, false);
        state = 'VALUE_END';
        key = '';
        pos += 4;
      } else if (byteCurrent === '{') {
        stack.push({ node, state, key });
        state = 'SEEK_CHILD';
        node = { entries: [], luaLength: 0, isRoot: false };
      }
    } else if (state === 'TEXT') {
      if (byteCurrent === '') {
        errmsg = 'unexpected string ending: missing close quote.';
        break;
      }
      if (escaping) {
        escaping = false;
      } else if (byteCurrent === '\\') {
        escaping = true;
      } else if (byteCurrent === byteQuotingChar) {
        data = rawBin.slice(pos1, pos)
          .replace('\\\n', '\n')
          .replace('\\"', '"')
          .replace('\\\\', '\\');
        if (componentName === 'KEY') {
          key = data;
          state = 'KEY_EXPRESSION_FINISH';
        } else if (componentName === 'VALUE') {
          nodeEntriesAppend(node, key, data);
          state = 'VALUE_END';
          key = '';
        }
        data = '';
      }
    } else if (state === 'INT') {
      if (byteCurrent === '.') {
        state = 'FLOAT';
      } else if (byteCurrent === '' || byteCurrent < '0' || byteCurrent > '9') {
        data = Number.parseInt(rawBin.slice(pos1, pos), 10);
        if (componentName === 'KEY') {
          key = data;
          state = 'KEY_EXPRESSION_FINISH';
          pos -= 1;
        } else if (componentName === 'VALUE') {
          nodeEntriesAppend(node, key, data);
          state = 'VALUE_END';
          key = '';
          pos -= 1;
        }
        data = '';
      }
    } else if (state === 'FLOAT') {
      if (byteCurrent === '' || byteCurrent < '0' || byteCurrent > '9') {
        if (pos === pos1 + 1 && rawBin.slice(pos1, pos) === '.') {
          errmsg = 'unexpected dot.';
          break;
        } else {
          data = Number.parseFloat(rawBin.slice(pos1, pos));
          if (componentName === 'KEY') {
            key = data;
            state = 'KEY_EXPRESSION_FINISH';
            pos -= 1;
          } else if (componentName === 'VALUE') {
            nodeEntriesAppend(node, key, data);
            state = 'VALUE_END';
            key = '';
            pos -= 1;
          }
          data = '';
        }
      }
    } else if (state === 'VALUE_END') {
      if (byteCurrent === '') {
        // pass
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (byteCurrent === ',') {
        state = 'SEEK_CHILD';
      } else if (byteCurrent === '}') {
        state = 'SEEK_CHILD';
        pos -= 1;
      } else if (!byteCurrentIsSpace) {
        errmsg = 'unexpected character.';
        break;
      }
    } else if (state === 'KEY_EXPRESSION_OPEN') {
      if (byteCurrent === '') {
        errmsg = 'key expression expected.';
        break;
      }
      if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (byteCurrent === '"' || byteCurrent === "'") {
        state = 'TEXT';
        componentName = 'KEY';
        pos1 = pos + 1;
        byteQuotingChar = byteCurrent;
      } else if (byteCurrent === '-' || (
        byteCurrent >= '0' && byteCurrent <= '9'
      )) {
        state = 'INT';
        componentName = 'KEY';
        pos1 = pos;
      } else if (byteCurrent === '.') {
        state = 'FLOAT';
        componentName = 'KEY';
        pos1 = pos;
      } else if (byteCurrent === 't' && rawBin.slice(pos, pos + 4) === 'true') {
        key = true;
        state = 'KEY_EXPRESSION_FINISH';
        pos += 3;
      } else if (byteCurrent === 'f' && rawBin.slice(pos, pos + 5) === 'false') {
        key = false;
        state = 'KEY_EXPRESSION_FINISH';
        pos += 4;
      } else if (byteCurrent === '{') {
        state = 'SEEK_CHILD';
        stack.push({ node, state, key });
        node = { entries: [], luaLength: 0 };
      }
    } else if (state === 'KEY_EXPRESSION_FINISH') {
      if (byteCurrent === '') {
        errmsg = 'unexpected end of table key expression, "]" expected.';
        break;
      }
      if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (byteCurrent === ']') {
        state = 'KEY_EXPRESSION_CLOSE';
      } else if (!byteCurrentIsSpace) {
        errmsg = 'unexpected character, "]" expected.';
        break;
      }
    } else if (state === 'KEY_EXPRESSION_CLOSE') {
      if (byteCurrent === '=') {
        state = 'VALUE';
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (!byteCurrentIsSpace) {
        errmsg = 'unexpected character, "=" expected.';
        break;
      }
    } else if (state === 'KEY_SIMPLE') {
      if (!(
        (byteCurrent >= 'A' && byteCurrent <= 'Z')
            || (byteCurrent >= 'a' && byteCurrent <= 'z')
            || (byteCurrent >= '0' && byteCurrent <= '9')
            || byteCurrent === '_'
      )) {
        key = rawBin.slice(pos1, pos);
        state = 'KEY_SIMPLE_END';
        pos -= 1;
      }
    } else if (state === 'KEY_SIMPLE_END') {
      if (byteCurrentIsSpace) {
        // pass
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
        comment = 'MULTILINE';
        pos += 3;
      } else if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
        comment = 'INLINE';
        pos += 1;
      } else if (byteCurrent === '=') {
        state = 'VALUE';
      } else if (byteCurrent === ',' || byteCurrent === '}') {
        if (key === 'true') {
          nodeEntriesAppend(node, node.luaLength + 1, true);
          state = 'VALUE_END';
          key = '';
          pos -= 1;
        } else if (key === 'false') {
          nodeEntriesAppend(node, node.luaLength + 1, false);
          state = 'VALUE_END';
          key = '';
          pos -= 1;
        } else {
          key = '';
          errmsg = 'invalid table simple key character.';
          break;
        }
      }
    }
    pos += 1;
    if (verbose) {
      print('          ', pos, '    ', state, comment, key, node);
    }
  }

  // check if there is any errors
  if (!errmsg && stack.length > 0) {
    errmsg = 'unexpected end of table, "}" expected.';
  }
  if (!errmsg && root.luaLength === 0) {
    errmsg = 'nothing can be unserialized from input string.';
  }
  if (errmsg) {
    pos = Math.min(pos, rawBinLength);
    const startPos = Math.max(0, pos - 4);
    const endPos = Math.min(pos + 10, rawBinLength);
    const errParts = rawBin.slice(startPos, endPos).replace(/\n/ui, '\\n');
    const errIndent = ' '.repeat(pos - startPos);
    throw new Error(`Unserialize luadata failed on pos ${pos}:\n    ${errParts}\n    ${errIndent}^\n    ${errmsg}`);
  }

  const res = [];
  for (let index = 0; index < root.entries.length; index++) {
    const kv = root.entries[index];
    res.push(kv[1]);
  }
  if (tuple) {
    return res as T;
  }
  return res[0] as T;
};

export default unserialize;
