## 问题根因

库存管理页面 `src/modules/inventory/InventoryModule.vue` 顶部长/短线筛选条有三个按钮：**长短线**、**仅长线**、**仅短线**。

三个按钮的设计模式一致：激活时通过 `:style` 内联样式显示浅紫底(`#f3e8ff`)+ 深紫字(`#7e22ce`),非激活时通过 `:class` 显示灰色。但"仅长线"按钮(第 874 行)的非激活态 class 被误写成了紫色：

- 长短线(868 行,正确):`:class="invFilterMode==='all' ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"`
- **仅长线(874 行,错误)**:`:class="invFilterMode==='longterm' ? '' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'"`
- 仅短线(880 行,正确):`:class="invFilterMode==='shortterm' ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'""`

非激活的 `purple-100/purple-600` 与激活态的 `#f3e8ff/#7e22ce` 都是紫色系,肉眼几乎无法区分,所以看起来"无论激活与否都是紫色"。

## 修复方案

将第 874 行"仅长线"按钮的非激活态 class 从紫色改为与另两个按钮一致的灰色:

```
:class="invFilterMode==='longterm' ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
```

仅此一处单行改动,不动其他逻辑。改后效果:非激活 = 灰底灰字,激活 = 浅紫底深紫字,与"长短线"/"仅短线"按钮行为完全一致。