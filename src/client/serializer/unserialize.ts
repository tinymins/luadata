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
  /**
   * the global for parsing luadata, defaults to empty object.
   */
  global?: Map<unknown, unknown> | Record<string, unknown>;
  /**
   * disable indexing non-exists global variable, defaults to true.
   */
  strictGlobal?: boolean;
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

interface VariableNode extends BasicNode {
  type: 'variable';
  startPos: number;
  state?: 'SIMPLE_KEY_START' | 'SIMPLE_KEY_MIDDLE' | 'WAIT_NEXT' | 'KEY_EXPRESSION_OPEN' | 'KEY_EXPRESSION_FINISH';
  currentValue?: Map<unknown, unknown> | unknown;
  isCurrentGlobal?: boolean;
}

type Node = RootNode | ValueNode | TableNode | TextNode | NumberNode | CommentNode | VariableNode;

/* istanbul ignore next */
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

const recToMapR = (o: Map<unknown, unknown> | Record<string, unknown>): Map<unknown, unknown> => {
  const m = new Map();
  if (o instanceof Map) {
    for (const [k, v] of o.entries()) {
      m.set(k, v instanceof Map || (v && typeof v === 'object')
        ? recToMapR(v as Record<string, unknown>)
        : v);
    }
  } else {
    for (const [k, v] of Object.entries(o)) {
      m.set(k, v instanceof Map || (v && typeof v === 'object')
        ? recToMapR(v as Record<string, unknown>)
        : v);
    }
  }
  return m;
};

const LUA_GLOBAL = {
  true: true,
  false: false,
  nil: void 0,
};
const REPORT_MESSAGE = 'this should never occur, please report this issue to "https://github.com/tinymins/luadata/issues"';

const unserialize = <T = unknown>(raw: string, { tuple, verbose, dictType = 'map', global: rawGlobal = {}, strictGlobal = true }: UnserializeOptions = {}): T => {
  const rawBin = raw;
  const rawBinLength = rawBin.length;
  const global: Map<unknown, unknown> = recToMapR(Object.assign(rawGlobal, LUA_GLOBAL));
  const stack: Node[] = [];
  const root: RootNode = {
    type: 'root',
    entries: [],
    state: 'SEEK_VALUE',
  };
  let node: Node = root;
  let pos = 0;
  let errmsg = '';

  const detectComment = (byteCurrent: string) => {
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
    let byteCurrent = '';
    let byteCurrentIsSpace = false;
    if (pos < rawBinLength) {
      byteCurrent = rawBin.slice(pos, pos + 1);
      byteCurrentIsSpace = byteCurrent === ' '
        || byteCurrent === '\r'
        || byteCurrent === '\n'
        || byteCurrent === '\t';
    }
    /* istanbul ignore next */
    if (verbose) {
      print('[step] pos', pos, byteCurrent, node, stack);
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
        } /* istanbul ignore next */ else {
          errmsg = `RootNode unexpected state, ${REPORT_MESSAGE}.`;
          break;
        }
      }
    } else if (node.type === 'value') {
      if (node.fulfilled) {
        const parentNode = stack.pop();
        /* istanbul ignore next */
        if (!parentNode) {
          errmsg = `ValueNode parent node is empty, ${REPORT_MESSAGE}.`;
          break;
        }
        parentNode.childValue = node.data;
        node = parentNode;
        pos -= 1;
      } else if (byteCurrentIsSpace) {
        // pass
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
      } else if (
        (byteCurrent >= 'a' && byteCurrent <= 'z')
          || (byteCurrent >= 'A' && byteCurrent <= 'Z')
          || (byteCurrent === '_')
      ) {
        stack.push(node);
        node = { type: 'variable', startPos: pos };
        pos -= 1;
      } else {
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
        /* istanbul ignore next */
        if (parentNode?.type !== 'value') {
          errmsg = `TextNode parent node is not a ValueNode, ${REPORT_MESSAGE}.`;
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
          /* istanbul ignore next */
          if (parentNode?.type !== 'value') {
            errmsg = `NumberNode(int) parent node is not a ValueNode, ${REPORT_MESSAGE}.`;
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
          /* istanbul ignore next */
          if (parentNode?.type !== 'value') {
            errmsg = `NumberNode(float) parent node is not a ValueNode, ${REPORT_MESSAGE}.`;
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
          errmsg = 'unexpected end of table, "}" expected.';
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
          /* istanbul ignore next */
          if (parentNode?.type !== 'value') {
            errmsg = `TableNode parent node is not a ValueNode, ${REPORT_MESSAGE}.`;
            break;
          }
          if (node.entries.length === node.luaLength) {
            const lst = [];
            for (let index = 0; index < node.entries.length; index++) {
              const kv = node.entries[index];
              lst.push(kv[1]);
            }
            parentNode.data = lst;
          } else if (dictType === 'map') {
            const dct = new Map();
            for (let index = 0; index < node.entries.length; index++) {
              const kv = node.entries[index];
              dct.set(kv[0], kv[1]);
            }
            parentNode.data = dct;
          } else if (dictType === 'object') {
            const rec: Record<string, unknown> = {};
            for (let index = 0; index < node.entries.length; index++) {
              const kv = node.entries[index];
              rec[String(kv[0])] = kv[1];
            }
            parentNode.data = rec;
          } /* istanbul ignore next */ else {
            errmsg = `TableNode unexpected dictType, ${REPORT_MESSAGE}.`;
            break;
          }
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
        } else {
          /* istanbul ignore next */
          if (node.simpleKeyStartPos === void 0) {
            errmsg = `TableNode simpleKeyStartPos is empty, ${REPORT_MESSAGE}.`;
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
          errmsg = 'unexpected end of table, "}" expected.';
          break;
        }
        if (detectComment(byteCurrent)) {
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
      } /* istanbul ignore next */ else {
        errmsg = `TableNode unexpected state, ${REPORT_MESSAGE}.`;
        break;
      }
    } else if (node.type === 'comment') {
      if (node.commentType === 'MULTILINE') {
        if (byteCurrent === ']' && rawBin.slice(pos, pos + 2) === ']]') {
          const parentNode = stack.pop();
          /* istanbul ignore next */
          if (!parentNode) {
            errmsg = `CommentNode(multiline) parent node is not a Node, ${REPORT_MESSAGE}.`;
            break;
          }
          node = parentNode;
          pos += 1;
        }
        if (byteCurrent === '') {
          errmsg = 'unexpected end of multiline comment, "]]" expected.';
          break;
        }
      } else if (node.commentType === 'INLINE') {
        if (byteCurrent === '\n' || byteCurrent === '') {
          const parentNode = stack.pop();
          /* istanbul ignore next */
          if (!parentNode) {
            errmsg = `CommentNode(inline) parent node is not a Node, ${REPORT_MESSAGE}.`;
            break;
          }
          node = parentNode;
        }
        if (byteCurrent === '') {
          pos -= 1;
        }
      } /* istanbul ignore next */ else {
        errmsg = `CommentNode unexpected commentType, ${REPORT_MESSAGE}.`;
        break;
      }
    } else if (node.type === 'variable') {
      if (node.state === void 0) {
        node.currentValue = global;
        node.isCurrentGlobal = true;
        node.state = 'SIMPLE_KEY_START';
      }
      if (node.state === 'SIMPLE_KEY_START') {
        if (
          (byteCurrent >= 'A' && byteCurrent <= 'Z')
            || (byteCurrent >= 'a' && byteCurrent <= 'z')
            || byteCurrent === '_'
        ) {
          node.state = 'SIMPLE_KEY_MIDDLE';
          node.startPos = pos;
        } else {
          errmsg = 'unexpected character, variable name expected.';
          break;
        }
      } else if (node.state === 'SIMPLE_KEY_MIDDLE') {
        if (
          (byteCurrent >= 'A' && byteCurrent <= 'Z')
            || (byteCurrent >= 'a' && byteCurrent <= 'z')
            || (byteCurrent >= '0' && byteCurrent <= '9')
            || byteCurrent === '_'
        ) {
          // pass
        } else {
          if (!(node.currentValue instanceof Map)) {
            errmsg = 'attempt to index a non-table value.';
            break;
          }
          const key = rawBin.slice(node.startPos, pos);
          if (strictGlobal && node.isCurrentGlobal && !global.has(key)) {
            errmsg = 'attempt to refer a non-exists global variable.';
            break;
          }
          node.currentValue = node.currentValue.get(key);
          node.isCurrentGlobal = false;
          node.state = 'WAIT_NEXT';
          pos -= 1;
        }
      } else if (node.state === 'WAIT_NEXT') {
        if (byteCurrent === '.') {
          node.state = 'SIMPLE_KEY_START';
        } else if (byteCurrent === '[') {
          node.state = 'KEY_EXPRESSION_OPEN';
          stack.push(node);
          node = { type: 'value' };
        } else {
          const parentNode = stack.pop();
          /* istanbul ignore next */
          if (parentNode?.type !== 'value') {
            errmsg = `VariableNode parent node is not a ValueNode, ${REPORT_MESSAGE}.`;
            break;
          }
          parentNode.data = node.currentValue;
          parentNode.fulfilled = true;
          node = parentNode;
          pos -= 1;
        }
      } else if (node.state === 'KEY_EXPRESSION_OPEN') {
        if (!(node.currentValue instanceof Map)) {
          errmsg = 'attempt to index a non-table value.';
          break;
        }
        node.currentValue = node.currentValue.get(node.childValue);
        node.isCurrentGlobal = false;
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
          node.state = 'WAIT_NEXT';
        } else if (!byteCurrentIsSpace) {
          errmsg = 'unexpected character, "]" expected.';
          break;
        }
      }
    } /* istanbul ignore next */ else {
      errmsg = `Node unexpected type, ${REPORT_MESSAGE}.`;
      break;
    }
    pos += 1;
    /* istanbul ignore next */
    if (verbose) {
      print('          ', pos, ' ', node, stack);
    }
  }

  // check if there is any errors
  if (!errmsg && stack.length > 0) {
    /* istanbul ignore next */
    if (verbose) {
      print('stack', stack);
    }
    errmsg = `Critical unserialize error: stack is not empty, ${REPORT_MESSAGE}.`;
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
