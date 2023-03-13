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

interface BasicNode {
  childValue?: unknown;
}

interface RootNode extends BasicNode {
  type: 'root';
  entries: unknown[];
  state: 'SEEK_VALUE' | 'WAIT_VALUE' | 'VALUE_END';
}

interface ValueNode extends BasicNode {
  type: 'value';
  fulfilled?: boolean;
  data?: unknown;
}

interface TableNode extends BasicNode {
  type: 'table';
  entries: [unknown, unknown][];
  luaLength: number;
  state: 'SEEK_CHILD' | 'KEY_SIMPLE' | 'KEY_SIMPLE_END' | 'KEY_EXPRESSION_OPEN' | 'KEY_EXPRESSION_FINISH' | 'KEY_EXPRESSION_CLOSE' | 'WAIT_VALUE' | 'VALUE_END';
  key?: unknown;
  simpleKeyStartPos?: number;
}

interface TextNode extends BasicNode {
  type: 'text';
  startPos: number;
  escaping?: boolean;
  quotingChar: '"' | "'";
}

interface NumberNode extends BasicNode {
  type: 'number';
  startPos: number;
  numberType: 'INT' | 'FLOAT';
}

interface CommentNode extends BasicNode {
  type: 'comment';
  startPos: number;
  commentType: 'INLINE' | 'MULTILINE';
}

type Node = RootNode | ValueNode | TableNode | TextNode | NumberNode | CommentNode;

const print = (...v: unknown[]) => {
  console.debug(v.map(d => (typeof d === 'object' ? JSON.stringify(d) : String(d))).join(', '));
};

const TABLE_ENTRIES_SORTER = (kv1: TableNode['entries'][number], kv2: TableNode['entries'][number]) => {
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

const nodeToTable = (node: Node, dictType: UnserializeOptions['dictType']): unknown[] | Map<unknown, unknown> | Record<string, unknown> | null => {
  if (node.type === 'table') {
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
  }
  return null;
};

let MAX = 1000;

const unserialize = <T = unknown>(raw: string, { tuple, verbose, dictType = 'map' }: UnserializeOptions = {}): T => {
  const rawBin = raw;
  const rawBinLength = rawBin.length;
  const stack: Node[] = [];
  const root: RootNode = {
    type: 'root',
    entries: [],
    state: 'SEEK_VALUE',
  };
  let node: Node | undefined = root;
  let pos = 0;
  let errmsg = '';

  const detectComment = (byteCurrent: string) => {
    if (!node) {
      return false;
    }
    if (byteCurrent === '-' && rawBin.slice(pos, pos + 4) === '--[[') {
      stack.push(node);
      node = { type: 'comment', startPos: pos + 3, commentType: 'MULTILINE' };
      pos += 3;
      return true;
    }
    if (byteCurrent === '-' && rawBin.slice(pos, pos + 2) === '--') {
      stack.push(node);
      node = { type: 'comment', startPos: pos + 2, commentType: 'INLINE' };
      pos += 1;
      return true;
    }
    return false;
  };

  while (pos <= rawBinLength) {
    MAX -= 1;
    if (MAX < 0) {
      throw new Error('unserialize: too many steps');
    }
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
      print('[step] pos', pos, byteCurrent, node, stack);
    }

    if (!node) {
      errmsg = 'unexpected empty node';
      break;
    }
    if (node.type === 'root') {
      if (detectComment(byteCurrent)) {
        // pass
      } else if (!byteCurrentIsSpace) {
        if (node.state === 'SEEK_VALUE') {
          node.state = 'WAIT_VALUE';
          stack.push(node);
          node = { type: 'value' };
          pos -= 1;
        } else if (node.state === 'WAIT_VALUE') {
          node.entries.push(node.childValue);
          node.state = 'VALUE_END';
          pos -= 1;
        } else if (node.state === 'VALUE_END') {
          if (byteCurrent === '') {
            break;
          } else if (byteCurrent === ',') {
            node.state = 'SEEK_VALUE';
          } else {
            errmsg = 'unexpected character.';
            break;
          }
        }
      }
    } else if (node.type === 'value') {
      if (node.fulfilled) {
        const parentNode = stack.pop();
        if (!parentNode) {
          errmsg = 'unexpected empty value parent, this should never occur.';
          break;
        }
        parentNode.childValue = node.data;
        node = parentNode;
        pos -= 1;
      } else if (detectComment(byteCurrent)) {
        // pass
      } else if (byteCurrent === '"' || byteCurrent === "'") {
        stack.push(node);
        node = { type: 'text', startPos: pos + 1, quotingChar: byteCurrent as '"' | "'" };
      } else if (byteCurrent === '-' || (byteCurrent >= '0' && byteCurrent <= '9')) {
        stack.push(node);
        node = { type: 'number', startPos: pos, numberType: 'INT' };
      } else if (byteCurrent === '.') {
        stack.push(node);
        node = { type: 'number', startPos: pos, numberType: 'FLOAT' };
      } else if (byteCurrent === '{') {
        stack.push(node);
        node = { type: 'table', entries: [], luaLength: 0, state: 'SEEK_CHILD' };
      } else if (byteCurrent === 't' && rawBin.slice(pos, pos + 4) === 'true') {
        node.data = true;
        node.fulfilled = true;
        pos += 3;
      } else if (byteCurrent === 'f' && rawBin.slice(pos, pos + 5) === 'false') {
        node.data = false;
        node.fulfilled = true;
        pos += 4;
      } else if (!byteCurrentIsSpace) { // byteCurrent === ',' || byteCurrent === '}'
        errmsg = 'unexpected empty value.';
        break;
      }
    } else if (node.type === 'text') {
      if (byteCurrent === '') {
        errmsg = 'unexpected string ending: missing close quote.';
        break;
      }
      if (node.escaping) {
        node.escaping = false;
      } else if (byteCurrent === '\\') {
        node.escaping = true;
      } else if (byteCurrent === node.quotingChar) {
        const parentNode = stack.pop();
        if (parentNode?.type !== 'value') {
          errmsg = 'unexpected empty text parent, this should never occur.';
          break;
        }
        parentNode.data = rawBin.slice(node.startPos, pos)
          .replace('\\\n', '\n')
          .replace('\\"', '"')
          .replace('\\\\', '\\');
        parentNode.fulfilled = true;
        node = parentNode;
      }
    } else if (node.type === 'number') {
      if (node.numberType === 'INT') {
        if (byteCurrent === '.') {
          node.numberType = 'FLOAT';
        } else if (byteCurrent === '' || byteCurrent < '0' || byteCurrent > '9') {
          const parentNode = stack.pop();
          if (parentNode?.type !== 'value') {
            errmsg = 'unexpected empty number parent, this should never occur.';
            break;
          }
          parentNode.data = Number.parseInt(rawBin.slice(node.startPos, pos), 10);
          parentNode.fulfilled = true;
          node = parentNode;
          pos -= 1;
        }
      } else if (node.numberType === 'FLOAT' && (byteCurrent === '' || byteCurrent < '0' || byteCurrent > '9')) {
        if (pos === node.startPos + 1 && rawBin.slice(node.startPos, pos) === '.') {
          errmsg = 'unexpected dot.';
          break;
        } else {
          const parentNode = stack.pop();
          if (parentNode?.type !== 'value') {
            errmsg = 'unexpected empty number parent, this should never occur.';
            break;
          }
          parentNode.data = Number.parseFloat(rawBin.slice(node.startPos, pos));
          parentNode.fulfilled = true;
          node = parentNode;
          pos -= 1;
        }
      }
    } else if (node.type === 'table') {
      if (node.state === 'SEEK_CHILD') {
        if (byteCurrent === '') {
          break;
        }
        if (detectComment(byteCurrent)) {
          // pass
        } else if (
          (byteCurrent >= 'A' && byteCurrent <= 'Z')
              || (byteCurrent >= 'a' && byteCurrent <= 'z')
              || byteCurrent === '_'
        ) {
          node.state = 'KEY_SIMPLE';
          node.simpleKeyStartPos = pos;
        } else if (byteCurrent === '[') {
          node.state = 'KEY_EXPRESSION_OPEN';
          stack.push(node);
          node = { type: 'value' };
        } else if (byteCurrent === '}') {
          const parentNode = stack.pop();
          if (parentNode?.type !== 'value') {
            errmsg = 'unexpected table closing, no matching opening braces found.';
            break;
          }
          parentNode.data = nodeToTable(node, dictType);
          parentNode.fulfilled = true;
          node = parentNode;
        } else if (!byteCurrentIsSpace) {
          node.key = node.luaLength + 1;
          node.state = 'WAIT_VALUE';
          stack.push(node);
          node = { type: 'value' };
          pos -= 1;
        }
      } else if (node.state === 'KEY_SIMPLE') {
        if (!(
          (byteCurrent >= 'A' && byteCurrent <= 'Z')
              || (byteCurrent >= 'a' && byteCurrent <= 'z')
              || (byteCurrent >= '0' && byteCurrent <= '9')
              || byteCurrent === '_'
        )) {
          node.key = rawBin.slice(node.simpleKeyStartPos, pos);
          node.state = 'KEY_SIMPLE_END';
          pos -= 1;
        }
      } else if (node.state === 'KEY_SIMPLE_END') {
        if (byteCurrentIsSpace) {
          // pass
        } else if (detectComment(byteCurrent)) {
          // pass
        } else if (byteCurrent === '=') {
          node.state = 'WAIT_VALUE';
          stack.push(node);
          node = { type: 'value' };
        } else if (byteCurrent === ',' || byteCurrent === '}') {
          if (node.simpleKeyStartPos === void 0) {
            errmsg = 'unexpected empty table simple key start pos, this should never occur.';
            break;
          }
          node.state = 'WAIT_VALUE';
          node.key = node.luaLength + 1;
          pos = node.simpleKeyStartPos - 1;
          stack.push(node);
          node = { type: 'value' };
        }
      } else if (node.state === 'KEY_EXPRESSION_OPEN') {
        node.key = node.childValue;
        node.state = 'KEY_EXPRESSION_FINISH';
        pos -= 1;
      } else if (node.state === 'KEY_EXPRESSION_FINISH') {
        if (byteCurrent === '') {
          errmsg = 'unexpected end of table key expression, "]" expected.';
          break;
        }
        if (detectComment(byteCurrent)) {
          // pass
        } else if (byteCurrent === ']') {
          node.state = 'KEY_EXPRESSION_CLOSE';
        } else if (!byteCurrentIsSpace) {
          errmsg = 'unexpected character, "]" expected.';
          break;
        }
      } else if (node.state === 'KEY_EXPRESSION_CLOSE') {
        if (byteCurrent === '=') {
          node.state = 'WAIT_VALUE';
          stack.push(node);
          node = { type: 'value' };
        } else if (detectComment(byteCurrent)) {
          // pass
        } else if (!byteCurrentIsSpace) {
          errmsg = 'unexpected character, "=" expected.';
          break;
        }
      } else if (node.state === 'WAIT_VALUE') {
        node.entries.push([node.key, node.childValue]);
        node.entries.sort(TABLE_ENTRIES_SORTER);
        let luaLength = 0;
        for (let index = 0; index < node.entries.length; index++) {
          const kv = node.entries[index];
          if (kv[0] === luaLength + 1) {
            luaLength += 1;
          }
        }
        node.luaLength = luaLength;
        node.state = 'VALUE_END';
        node.key = void 0;
        pos -= 1;
      } else if (node.state === 'VALUE_END') {
        if (byteCurrent === '') {
          // pass
        } else if (detectComment(byteCurrent)) {
          // pass
        } else if (byteCurrent === ',') {
          node.state = 'SEEK_CHILD';
        } else if (byteCurrent === '}') {
          node.state = 'SEEK_CHILD';
          pos -= 1;
        } else if (!byteCurrentIsSpace) {
          errmsg = 'unexpected character.';
          break;
        }
      }
    } else if (node.type === 'comment') {
      if (node.commentType === 'MULTILINE') {
        if (byteCurrent === ']' && rawBin.slice(pos, pos + 2) === ']]') {
          node = stack.pop();
          pos += 1;
        }
      } else if (node.commentType === 'INLINE' && byteCurrent === '\n') {
        node = stack.pop();
      }
    }
    pos += 1;
    if (verbose) {
      print('          ', pos, ' ', node, stack);
    }
  }

  // check if there is any errors
  if (!errmsg && stack.length > 0) {
    if (verbose) {
      print('stack', stack);
    }
    errmsg = 'unexpected end of table, "}" expected.';
  }
  if (!errmsg && root.entries.length === 0) {
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

  if (tuple) {
    return root.entries as T;
  }
  return root.entries[0] as T;
};

export default unserialize;
