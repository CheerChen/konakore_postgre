# Konachan 相关度排序重构方案

## 背景与目标

用户有一批已标记为 `is_liked = true` 的 Konachan post，希望在浏览新帖流时快速看出"哪些画廊和我的喜好相关"。现有 `TagManager.learnTfIdf()` 和 `sortPostsByTfIdfHybrid()` 存在算法缺陷，导致排序几乎无效。

本方案**只改动 `TagManager.js` 内部逻辑，不修改 schema、API 和其他组件**。新增一个「相关度排序」入口，结合直方图+阈值滑块让用户感知和调节筛选精度。

---

## 现有算法的根本缺陷

### 问题 1：TF 公式退化为常数

```js
// 当前代码（错误）
const tf = tf1.get(tag) / tf2.get(tag);
// tf1 = 包含该tag的liked post篇数
// tf2 = 包含该tag的所有liked post的tag总数之和
// 结论：由于 Danbooru 每个tag在每篇post只出现1次，
//       tf ≈ 1 / 平均每篇post的tag数 ≈ 同一个常数
// 所以：收藏1次某artist和收藏100次，得分完全相同
```

### 问题 2：每批归一化，跨页不可比

```js
const normProfile = maxProfile > 0 ? raw.profile / maxProfile : 0;
// 每批 post 都除以本批 maxProfile，导致第1页和第3页的分数无法比较
```

### 问题 3：Profile score 平均化

```js
scores.profile = totalWeight / tags.length;
// 惩罚了 tag 多的 post，tag 越多得分基础越低
// 正确应该用 SUM，而非 SUM/N
```

### 问题 4：tagme 过滤定义了但没调用

`learnTfIdf()` 里未调用 `isTagmeTag()`，`tagme`、`tagme_(artist)` 会被学进偏好模型。

---

## 修正方案

### 核心公式（对齐 eh-stash）

```
weight_i = (1 + ln(tf_i)) × ln(N / df_i) × typeWeight_i

其中：
  tf_i     = 你 liked posts 中包含该 tag 的篇数（纯计数，非比例）
  df_i     = tagInfo.get(tag).count（全局出现画廊数，已在 tags 表中，直接用）
  N        = totalPosts（总画廊数，作为参数传入，无需硬编码 400000）
  typeWeight = TFIDF_HYBRID_CONFIG.typeWeights[tagType]

单篇 post 得分：
  score = SUM(weight_i)  for each tag in post that exists in weightMap
```

---

## 需要修改的内容

### 1. 修正 `learnTfIdf(likedPosts, totalPosts)`

```js
learnTfIdf(likedPosts, totalPosts = 400000) {
  if (!likedPosts?.length) return new Map();

  // 计算 TF：每个tag在 liked posts 中出现的篇数（每篇post只算1次）
  const tf = new Map(); // tag -> 出现篇数（sublinear前）

  likedPosts.forEach(post => {
    const tagsString = post.tags ?? post.data?.tags ?? '';
    if (typeof tagsString !== 'string') return;

    const tags = tagsString.split(' ').filter(Boolean);
    const seen = new Set();
    tags.forEach(tag => {
      if (seen.has(tag)) return;
      seen.add(tag);
      if (!isTagmeTag(tag)) {  // ← 调用已有的 tagme 过滤
        tf.set(tag, (tf.get(tag) || 0) + 1);
      }
    });
  });

  // 构建 weightMap
  const weightMap = new Map();
  tf.forEach((count, tag) => {
    const tagInfo = this.state.tagInfo.get(tag);
    if (!tagInfo) return;

    const df = Math.max(tagInfo.count || 1, 1);
    const tagType = tagInfo.type ?? 0;
    const typeWeight = TFIDF_HYBRID_CONFIG.typeWeights[tagType] ?? 1.0;

    // sublinear TF × IDF × typeWeight
    const weight = (1 + Math.log(count)) * Math.log(totalPosts / df) * typeWeight;
    if (weight > 0) weightMap.set(tag, weight);
  });

  return weightMap;
}
```

### 2. 新增 `scorePost(post, weightMap)` 方法

替代原有混合打分，直接返回纯相关度分数：

```js
scorePost(post, weightMap) {
  const tagsString = post.tags ?? post.data?.tags ?? '';
  if (typeof tagsString !== 'string') return 0;

  const tags = tagsString.split(' ').filter(Boolean);
  return tags.reduce((sum, tag) => sum + (weightMap.get(tag) || 0), 0);
}
```

### 3. 新增 `sortPostsByRelevance(posts, threshold = 0)` 方法

作为"相关度排序"的入口，**保留原有 `sortPostsByTfIdfHybrid` 不动，避免现有调用报错**：

```js
sortPostsByRelevance(posts, threshold = 0) {
  if (!posts?.length) return posts;
  if (!this.state.likedPosts?.length) return posts;

  const weightMap = this.learnTfIdf(
    this.state.likedPosts,
    this._totalPosts || 400000
  );

  return posts
    .map(post => ({ post, score: this.scorePost(post, weightMap) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ post, score }) => {
      post._relevanceScore = score;  // 挂载到 post 用于调试/展示
      return post;
    });
}
```

`_totalPosts` 通过下面的方法设置，避免硬编码。

### 4. 新增 `setTotalPosts(n)` 和 `computeScoreDistribution(posts)` 方法

```js
setTotalPosts(n) {
  this._totalPosts = n;
}

// 返回当前加载 posts 的相关度分数直方图数据
// 格式：[{ min, max, count }, ...]
computeScoreDistribution(posts, buckets = 30) {
  if (!this.state.likedPosts?.length) return [];

  const weightMap = this.learnTfIdf(
    this.state.likedPosts,
    this._totalPosts || 400000
  );

  const scores = posts.map(p => this.scorePost(p, weightMap)).filter(s => s > 0);
  if (!scores.length) return [];

  const min = 0;
  const max = Math.max(...scores);
  if (max === 0) return [];

  const width = max / buckets;
  const histogram = Array.from({ length: buckets }, (_, i) => ({
    min: +(i * width).toFixed(2),
    max: +((i + 1) * width).toFixed(2),
    count: 0,
  }));

  scores.forEach(s => {
    const idx = Math.min(Math.floor(s / width), buckets - 1);
    histogram[idx].count++;
  });

  return histogram;
}
```

---

## UI 需求：设置按钮 → 模态窗口中的直方图+阈值滑块

### 入口

页面右上角加一个设置按钮（⚙ 图标），点击打开模态窗口。模态窗口中包含一个"相关度筛选"面板。

### 面板内容

1. **直方图**（柱状图，Y 轴 Log scale）
   - X 轴：相关度分数范围（0 ~ max score）
   - Y 轴：该区间的 post 数量（Log scale，避免长尾问题）
   - 每根柱子 hover 时显示 tooltip：`分数区间: count 篇`
   - 阈值线：一条红色垂直线，位置与滑块联动

2. **滑块**
   - min = 0，max = 当前 posts 的最高 score
   - 拖动时，阈值线实时移动，右侧计数实时更新
   - 显示：`阈值 ≥ X.X：N 篇`

3. **应用按钮**
   - 点击 → 调用 `tagManager.sortPostsByRelevance(currentPosts, threshold)`
   - 结果替换当前帖子列表显示

4. **重置按钮**
   - 清空阈值，恢复原始排序

### 数据来源

直方图数据通过 `tagManager.computeScoreDistribution(currentPosts)` 获取，在模态窗口打开时计算（无需后端请求）。

---

## 完整流程示意

```
用户打开设置 → 模态窗口
       ↓
computeScoreDistribution(当前页 posts)
       ↓
直方图渲染（Log scale Y轴）
       ↓
用户拖动滑块，选择阈值（红线联动，计数实时更新）
       ↓
点击「应用」
       ↓
sortPostsByRelevance(posts, threshold)
       ↓
列表按相关度降序提前展示，低于阈值的排到末尾或隐藏
```

---

## 约束与注意事项

- **不修改数据库 schema**，不修改 API
- **保留 `sortPostsByTfIdfHybrid`** 原方法，新增 `sortPostsByRelevance` 作为改进版
- `tagInfo` 必须已加载（`fetchTagInfo()` 完成后才能打分），否则 `weightMap` 为空 Map，scorePost 全返回 0
- `fetchLikedPosts()` 必须先调用（已有 30 分钟缓存机制）
- 直方图只基于**当前已加载的 posts**，不代表全库分布，需在 UI 中注明「当前页分布」
- totalPosts 建议通过 API 的 `pagination.total_items` 动态注入到 `tagManager.setTotalPosts(n)`，而非写死 400000
