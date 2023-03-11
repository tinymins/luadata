interface SerializeOptions {
  tuple?: boolean;
  indent?: string | null;
  indentLevel?: number;
}

const serializeR = <T = unknown>(v: T, { indent = null, indentLevel = 0 }: SerializeOptions): string => {
  const parts = [];
  if (v === void 0 || v === null) {
    parts.push('nil');
  } else if (typeof v === 'boolean') {
    parts.push(v ? 'true' : 'false');
  } else if (typeof v === 'number') {
    parts.push(v);
  } else if (typeof v === 'string') {
    parts.push(
      '"',
      v
        .replace(/\\/gui, '\\\\')
        .replace(/"/gui, '\\"')
        .replace(/\n/gui, '\\\n'),
      '"',
    );
  } else {
    // calc lua table entries
    const entries = [];
    if (Array.isArray(v)) {
      for (const [i, element] of v.entries()) {
        entries.push([i + 1, element]);
      }
    } else if (v instanceof Map) {
      for (const [kk, vv] of v.entries()) {
        entries.push([kk, vv]);
      }
    } else {
      for (const [kk, vv] of Object.entries(v)) {
        entries.push([kk, vv]);
      }
    }

    // build lua table parts
    parts.push('{');
    let indentEqual = '=';

    // process indent
    if (indent !== null) {
      indentEqual = ' = ';
      if (entries.length > 0) {
        parts.push('\n');
      }
    }

    // prepare for iterator
    let noHash = true;
    let lastKey = null;
    let lastVal = null;
    let hasVal = false;
    for (const [key, val] of entries) {
      // judge if this is a pure list table
      if (
        noHash
          && (!Number.isInteger(key)
            || (lastVal === null && key !== 1)
            || (lastKey !== null && lastKey + 1 !== key))
      ) {
        noHash = false;
      }

      /*
       * --------------------------
       * process to insert to table
       * --------------------------
       */

      // insert indent
      if (indent !== null) {
        parts.push(indent.repeat(indentLevel + 1));
      }
      // insert key
      if (noHash) {
        // pure list: do not need a key
      } else if (
        typeof key === 'string'
          && (/^[A-Z_a-z]\w*$/ui).test(key)
      ) {
        // a = val
        parts.push(key, indentEqual);
      } else {
        /*
         * [10010] = val
         * [".start with or contains special char"] = val
         */
        parts.push(
          '[',
          serializeR(key, { indent, indentLevel: indentLevel + 1 }),
          ']',
          indentEqual,
        );
      }
      // insert value
      parts.push(serializeR(val, { indent, indentLevel: indentLevel + 1 }), ',');
      if (indent !== null) {
        parts.push('\n');
      }
      lastKey = key;
      lastVal = val;
      hasVal = true;
    }

    // remove last `,` if no indent
    if (indent === null && hasVal) {
      parts.pop();
    }

    // insert `}` with indent
    if (indent !== null && entries.length > 0) {
      parts.push(indent.repeat(indentLevel));
    }
    parts.push('}');
  }
  return parts.join('');
};

const serialize = <T = unknown>(v: T, options: SerializeOptions = {}): string => {
  if (options.tuple && Array.isArray(v)) {
    const { indent = null, indentLevel = 0 } = options;
    const res: string[] = [];
    for (const item of v) {
      res.push(serializeR(item, options));
    }
    let splitter = ',';
    if (indent !== null) {
      splitter = `,\n${indent.repeat(indentLevel)}`;
    }
    return res.join(splitter);
  }
  return serializeR(v, options);
};

export default serialize;
