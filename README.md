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

const v = {
  some: 'luadata',
};
luadata.serialize(v); // '{some="luadata"}'
```

#### serialize.indent

> Control if stringified data should be human-read formatted.

```javascript
import * as luadata from 'luadata';

const v = {
  some: 'luadata',
};
luadata.serialize(v, { indent: "    " });
```

Output

```plain
{
    some = "luadata",
}
```

#### serialize.indentLevel

> Control stringified data should be human-read formatted at which level, notice that first line will not be automatic indented.

```javascript
import * as luadata from 'luadata';

const v = {
  some: 'luadata',
};
luadata.serialize(v, { indent: "    ", indentLevel: 1 });
```

Output

```plain
{
        some = "luadata",
    }
```

#### serialize.tuple

> Control if the stringified data is a multi-value luadata.

```javascript
import * as luadata from 'luadata';

const v = [
  'This is a tuple',
  { a: 1 },
];
luadata.serialize(v, { tuple: true }); // 'This is a tuple',{a=1}
```

### unserialize

> Unserialize `lua` data string to `javascript` variable.

```javascript
import * as luadata from 'luadata';

const luadata_str = "{a=1,b=2,3}";

luadata.unserialize(luadata_str); // new Map([["a", 1], ["b", 2], [1, 3]])
luadata.unserialize(luadata_str, { dictType: 'object' }); // { a: 1, b: 2, 3: 3 }
```

#### unserialize.tuple

> Control if the `lua` data string is a tuple variable.

```javascript
import * as luadata from 'luadata';

const luadata_str = "'This is a tuple',1,false";

luadata.unserialize(luadata_str, { tuple: true }); // ['This is a tuple', 1, false]
```

#### unserialize.dictType

> Control how will the luadata table will be transformed into javascript variable. Due to javascript limitation that javascript object key must be string or symbol, `object` mode will cause data/typing loss.

```javascript
import * as luadata from 'luadata';

const luadata_str = "{a=1,b=2,['3']='three',[3]=3}";

luadata.unserialize(luadata_str, { dictType: 'map' }); // new Map([["a", 1], ["b", 2], ["3", "three"], [3, 3]])
luadata.unserialize(luadata_str, { dictType: 'object' }); // { a: 1, b: 2, 3: 3 }
```

#### unserialize.global

> Provide luadata _G environment, supports both object like or map like. Due to javascript limitation that javascript object key must be string or symbol, `object` mode will cause data/typing loss.

```javascript
import * as luadata from 'luadata';

luadata.unserialize("a", { global: { a: 1 } }); // 1
luadata.unserialize("a['b'].c", { global: { a: { b: { c: { 1 } } } } }); // 1
```

#### unserialize.strictGlobal

> Control if non-exists global variable is allowed, default value is `true`.

```javascript
import * as luadata from 'luadata';

luadata.unserialize("b", { global: { a: 1 } }); // Error: attempt to refer a non-exists global variable.
luadata.unserialize("b", { global: { a: 1 }, strictGlobal: false }); // undefined
```

## LICENSE

BSD
