# luadata

[![NPM version](https://img.shields.io/npm/v/luadata.svg?style=flat)](https://npmjs.org/package/luadata)
[![NPM downloads](http://img.shields.io/npm/dm/luadata.svg?style=flat)](https://npmjs.org/package/luadata)

This is a npm package that can serialize array and object to Lua table, or unserialize Lua table to array and object.

## Install

```bash
$ npm install
```

```bash
$ npm run dev
$ npm run build
```

## Usage

### serialize

> Serialize `javascript` variable to `lua` data string.

```javascript
import * as luadata from 'luadata';

luadata.serialize(v, { indent: "\t", indentLevel: 0 });
```

### unserialize

> Unserialize `lua` data string to `javascript` variable.

```javascript
import * as luadata from 'luadata';

luadata.unserialize(luadata_str, { multival: false })
```

## LICENSE

BSD
