# 销售分析模块设计

## 概述

新增"销售分析"独立 tab，对已售商品进行 SKU 聚合分析，提供四象限气泡散点图和帕累托图，帮助评估盈利能力 + 销售变现速度。

## 功能需求

### 1. Tab 入口

- 位置：侧边栏"销售记账"之后
- Tab ID：`sales-analysis`
- 图标：`fa-solid fa-chart-column`

### 2. SKU 聚合规则

分析对象：**已销售商品（status === 'sold'）**

#### A 类：非 Hotwheels 品牌

按品牌聚合，如 TLV、Tomica、Kyosho、MINIGT、Matchbox 等。

#### B 类：Hotwheels 细分

| 子品类 | 条件 |
|--------|------|
| RLC | 产品名称包含 "RLC" 或 "ELITE" |
| Hotwheels(非RLC) | 其他 Hotwheels 产品 |

### 3. 四象限气泡散点图

**坐标轴**：
- X 轴：加权平均入库至售出天数 = Σ(售出天数 × qty) / Σqty
- Y 轴：销售利润率 = Σprofit / Σcost

**气泡大小**：累计销售利润总额 = Σprofit

**参考线**：
- X = 90 天（售出周期分界线）
- Y = 25%（毛利率分界线）

**象限含义**：
- 左上：高利润 + 快周转（理想）
- 右上：高利润 + 慢周转（需关注）
- 左下：低利润 + 快周转（可优化定价）
- 右下：低利润 + 慢周转（考虑淘汰）

### 4. 帕累托图

**柱状图（蓝色）**：SKU 累计销售利润额，降序排列

**折线图（橙色）**：累计利润占总利润的百分比

**参考线**：80% 横线（帕累托经典线）

**柱子颜色标记**（基于平均售出天数）：
- 绿色：平均售出天数 < 3 个月（周转好）
- 黄色：3-6 个月（周转预警）
- 红色：> 6 个月（周转很慢）

## 技术实现

### 文件结构

```
src/modules/sales-analysis/
├── SalesAnalysisModule.vue    # 主组件
├── useSalesAnalysis.js        # 数据聚合和计算逻辑
└── useSalesAnalysis.test.js   # 测试
```

### 数据计算逻辑

#### SKU 聚合

```js
function aggregateSKUs(items) {
  const soldItems = items.filter(i => i.status === 'sold')
  
  // 按聚合规则分组
  const groups = {}
  soldItems.forEach(item => {
    const skuKey = getAggregateKey(item)
    if (!groups[skuKey]) {
      groups[skuKey] = { key: skuKey, items: [] }
    }
    groups[skuKey].items.push(item)
  })
  
  // 计算指标
  return Object.values(groups).map(group => {
    const totalCost = group.items.reduce((s, i) => s + i.cost, 0)
    const totalProfit = group.items.reduce((s, i) => s + (i.saleDetails?.profit || 0), 0)
    const totalQty = group.items.reduce((s, i) => s + (i.qty || 1), 0)
    
    // 加权平均售出天数
    const totalDays = group.items.reduce((s, i) => {
      const inDate = new Date(i.inventoryDetails?.inStockDate || i.purchaseDetails?.date).getTime()
      const soldDate = new Date(i.saleDetails?.date).getTime()
      const days = (soldDate - inDate) / 86400000
      return s + days * (i.qty || 1)
    }, 0)
    const avgDays = totalDays / totalQty
    
    // 利润率
    const profitRate = totalCost > 0 ? totalProfit / totalCost : 0
    
    return {
      key: group.key,
      totalCost,
      totalProfit,
      totalQty,
      avgDays,
      profitRate,
    }
  })
}

function getAggregateKey(item) {
  if (item.brand !== 'Hotwheels') {
    return item.brand || '其它'
  }
  // Hotwheels 细分
  const name = (item.name || '').toUpperCase()
  if (name.includes('RLC') || name.includes('ELITE')) {
    return 'RLC'
  }
  return 'Hotwheels(非RLC)'
}
```

### 图表配置

#### 四象限气泡散点图

使用 Chart.js scatter 类型：

```js
{
  type: 'bubble',
  data: {
    datasets: [{
      data: skus.map(s => ({
        x: s.avgDays,
        y: s.profitRate,
        r: Math.sqrt(s.totalProfit / maxProfit) * 30 + 5,  // 气泡大小
      })),
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
    }]
  },
  options: {
    plugins: {
      annotation: {
        annotations: {
          lineX: { type: 'line', xMin: 90, xMax: 90, borderColor: 'red' },
          lineY: { type: 'line', yMin: 0.25, yMax: 0.25, borderColor: 'red' },
        }
      }
    }
  }
}
```

#### 帕累托图

使用 Chart.js bar+line 混合：

```js
{
  type: 'bar',
  data: {
    datasets: [
      {
        type: 'bar',
        label: '累计利润',
        data: skus.map(s => s.totalProfit),
        backgroundColor: skus.map(s => getBarColor(s.avgDays)),
      },
      {
        type: 'line',
        label: '累计百分比',
        data: cumulativePercentages,
        yAxisID: 'y1',
        borderColor: 'orange',
      }
    ]
  },
  options: {
    scales: {
      y1: { position: 'right', max: 100 }
    },
    plugins: {
      annotation: {
        annotations: {
          line80: { type: 'line', yMin: 80, yMax: 80, borderColor: 'red' }
        }
      }
    }
  }
}

function getBarColor(avgDays) {
  if (avgDays < 90) return 'rgba(34, 197, 94, 0.7)'   // 绿色
  if (avgDays < 180) return 'rgba(234, 179, 8, 0.7)'  // 黄色
  return 'rgba(239, 68, 68, 0.7)'                      // 红色
}
```

### 页面布局

```
┌─────────────────────────────────────────────────────┐
│  销售分析  Sales Analysis                            │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ 已售 SKU  │  │ 总利润    │  │ 平均周期  │          │
│  │  N 个     │  │ ¥XX.XX   │  │ XX 天     │          │
│  └──────────┘  └──────────┘  └──────────┘          │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────┬─────────────────────────┐  │
│  │  四象限气泡散点图    │  帕累托图                │  │
│  │                     │                         │  │
│  │  X: 售出天数         │  柱: 累计利润            │  │
│  │  Y: 利润率           │  线: 累计百分比          │  │
│  │  气泡: 总利润        │  颜色: 周转速度          │  │
│  └─────────────────────┴─────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  SKU 明细表格                                        │
│  聚合SKU | 件数 | 总成本 | 总利润 | 利润率 | 平均天数 │
└─────────────────────────────────────────────────────┘
```

## 依赖

- `chart.js`（已安装）
- `chartjs-plugin-annotation`（需安装，用于参考线）

## 测试要点

1. SKU 聚合逻辑（A 类 / B 类 / RLC 识别）
2. 四象限指标计算（加权平均天数、利润率）
3. 帕累托累计百分比计算
4. 颜色标记逻辑（3/6 个月分界）
